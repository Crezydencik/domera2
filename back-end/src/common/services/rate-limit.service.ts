import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Request } from 'express';

type RateLimitEntry = { count: number; resetAt: number };

@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private readonly memCache = new Map<string, RateLimitEntry>();
  private readonly cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    // Evict expired entries every 60 seconds to prevent unbounded memory growth.
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.memCache.entries()) {
        if (entry.resetAt <= now) this.memCache.delete(key);
      }
    }, 60_000);
  }

  onModuleDestroy() {
    clearInterval(this.cleanupTimer);
  }

  consume(
    key: string,
    limit: number,
    windowMs: number,
  ): { allowed: boolean; remaining: number; resetAt: number } {
    const docId = this.toDocId(key);
    const now = Date.now();

    let entry = this.memCache.get(docId);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      this.memCache.set(docId, entry);
    }

    if (entry.count >= limit) {
      return { allowed: false, remaining: 0, resetAt: entry.resetAt };
    }

    entry.count += 1;
    return { allowed: true, remaining: Math.max(0, limit - entry.count), resetAt: entry.resetAt };
  }

  buildKey(request: Request, routeScope: string, actorScope?: string): string {
    return `${routeScope}:${actorScope ?? 'anon'}:${this.getClientIp(request)}`;
  }

  private toDocId(key: string): string {
    return createHash('sha256').update(key).digest('hex');
  }

  private getClientIp(request: Request): string {
    const xff = request.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.trim()) {
      const first = xff.split(',')[0]?.trim();
      if (first) return first;
    }

    const realIp = request.headers['x-real-ip'];
    if (typeof realIp === 'string' && realIp.trim()) {
      return realIp.trim();
    }

    return request.ip || 'unknown-ip';
  }
}
