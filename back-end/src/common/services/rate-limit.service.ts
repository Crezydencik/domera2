import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Request } from 'express';
import { TooManyRequestsException } from '../errors/too-many-requests.exception';

type RateLimitEntry = { count: number; resetAt: number };
export type RateLimitResult = { allowed: boolean; remaining: number; resetAt: number };

const TRUST_PROXY_HEADERS = process.env.TRUST_PROXY_HEADERS === 'true';
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/+$/, '');
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const REDIS_TIMEOUT_MS = Math.max(50, Number(process.env.RATE_LIMIT_REDIS_TIMEOUT_MS ?? 400));
const KEY_PREFIX = process.env.RATE_LIMIT_KEY_PREFIX ?? 'rl:';
const MEM_MAX_ENTRIES = Math.max(1000, Number(process.env.RATE_LIMIT_MEM_MAX_ENTRIES ?? 20000));

/**
 * Fixed-window rate limiter.
 *
 * - With UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN set, counters live in Redis and are
 *   shared by every serverless instance (in-memory counters on Vercel are per-instance, so the
 *   effective limit used to be `limit × number of warm instances`).
 * - Without Redis (local dev) or when Redis is unreachable, falls back to an in-process map
 *   (fail-open to memory, never fail-closed for the whole API).
 */
@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly memCache = new Map<string, RateLimitEntry>();
  private readonly cleanupTimer: ReturnType<typeof setInterval>;
  private readonly redisEnabled = Boolean(REDIS_URL && REDIS_TOKEN);

  constructor() {
    this.cleanupTimer = setInterval(() => this.evictExpired(Date.now()), 60_000);
    this.cleanupTimer.unref?.();
  }

  onModuleDestroy() {
    clearInterval(this.cleanupTimer);
  }

  async consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const id = this.toDocId(key);
    if (this.redisEnabled) {
      try {
        return await this.consumeRedis(id, limit, windowMs);
      } catch (error) {
        this.logger.warn(`Redis rate limit unavailable, using memory: ${(error as Error).message}`);
      }
    }
    return this.consumeMemory(id, limit, windowMs);
  }

  /**
   * Consumes one unit and throws HTTP 429 (with retryAfter) when the limit is exceeded.
   * Prefer this over `consume` + manual check in new code.
   */
  async enforce(
    request: Request,
    routeScope: string,
    actorScope: string | undefined,
    limit: number,
    windowMs = 60_000,
  ): Promise<void> {
    const rl = await this.consume(this.buildKey(request, routeScope, actorScope), limit, windowMs);
    if (!rl.allowed) throw new TooManyRequestsException(rl.resetAt);
  }

  buildKey(request: Request, routeScope: string, actorScope?: string): string {
    return `${routeScope}:${actorScope ?? 'anon'}:${this.getClientIp(request)}`;
  }

  private async consumeRedis(id: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const key = `${KEY_PREFIX}${id}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REDIS_TIMEOUT_MS);
    try {
      // INCR + set TTL only on the first hit of the window (NX) + read remaining TTL.
      const response = await fetch(`${REDIS_URL}/pipeline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([
          ['INCR', key],
          ['PEXPIRE', key, String(windowMs), 'NX'],
          ['PTTL', key],
        ]),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const results = (await response.json()) as Array<{ result?: unknown; error?: string }>;
      const failed = results.find((item) => item.error);
      if (failed) throw new Error(failed.error);

      const count = Number(results[0]?.result ?? 0);
      const ttl = Number(results[2]?.result ?? windowMs);
      const resetAt = Date.now() + (ttl > 0 ? ttl : windowMs);
      return {
        allowed: count <= limit,
        remaining: Math.max(0, limit - count),
        resetAt,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private consumeMemory(id: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    let entry = this.memCache.get(id);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      this.memCache.set(id, entry);
      if (this.memCache.size > MEM_MAX_ENTRIES) this.evictExpired(now, true);
    }

    if (entry.count >= limit) {
      return { allowed: false, remaining: 0, resetAt: entry.resetAt };
    }

    entry.count += 1;
    return { allowed: true, remaining: Math.max(0, limit - entry.count), resetAt: entry.resetAt };
  }

  private evictExpired(now: number, enforceMax = false) {
    for (const [key, entry] of this.memCache) {
      if (entry.resetAt <= now) this.memCache.delete(key);
    }
    if (!enforceMax) return;
    while (this.memCache.size > MEM_MAX_ENTRIES) {
      const oldest = this.memCache.keys().next().value as string | undefined;
      if (!oldest) return;
      this.memCache.delete(oldest);
    }
  }

  private toDocId(key: string): string {
    return createHash('sha256').update(key).digest('hex');
  }

  private getClientIp(request: Request): string {
    if (TRUST_PROXY_HEADERS) {
      const xff = request.headers['x-forwarded-for'];
      if (typeof xff === 'string' && xff.trim()) {
        const first = xff.split(',')[0]?.trim();
        if (first) return first;
      }

      const realIp = request.headers['x-real-ip'];
      if (typeof realIp === 'string' && realIp.trim()) {
        return realIp.trim();
      }
    }

    return request.ip || 'unknown-ip';
  }
}
