"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var RateLimitService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimitService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const too_many_requests_exception_1 = require("../errors/too-many-requests.exception");
const TRUST_PROXY_HEADERS = process.env.TRUST_PROXY_HEADERS === 'true';
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/+$/, '');
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const REDIS_TIMEOUT_MS = Math.max(50, Number(process.env.RATE_LIMIT_REDIS_TIMEOUT_MS ?? 400));
const KEY_PREFIX = process.env.RATE_LIMIT_KEY_PREFIX ?? 'rl:';
const MEM_MAX_ENTRIES = Math.max(1000, Number(process.env.RATE_LIMIT_MEM_MAX_ENTRIES ?? 20000));
let RateLimitService = RateLimitService_1 = class RateLimitService {
    constructor() {
        this.logger = new common_1.Logger(RateLimitService_1.name);
        this.memCache = new Map();
        this.redisEnabled = Boolean(REDIS_URL && REDIS_TOKEN);
        this.cleanupTimer = setInterval(() => this.evictExpired(Date.now()), 60_000);
        this.cleanupTimer.unref?.();
    }
    onModuleDestroy() {
        clearInterval(this.cleanupTimer);
    }
    async consume(key, limit, windowMs) {
        const id = this.toDocId(key);
        if (this.redisEnabled) {
            try {
                return await this.consumeRedis(id, limit, windowMs);
            }
            catch (error) {
                this.logger.warn(`Redis rate limit unavailable, using memory: ${error.message}`);
            }
        }
        return this.consumeMemory(id, limit, windowMs);
    }
    async enforce(request, routeScope, actorScope, limit, windowMs = 60_000) {
        const rl = await this.consume(this.buildKey(request, routeScope, actorScope), limit, windowMs);
        if (!rl.allowed)
            throw new too_many_requests_exception_1.TooManyRequestsException(rl.resetAt);
    }
    buildKey(request, routeScope, actorScope) {
        return `${routeScope}:${actorScope ?? 'anon'}:${this.getClientIp(request)}`;
    }
    async consumeRedis(id, limit, windowMs) {
        const key = `${KEY_PREFIX}${id}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REDIS_TIMEOUT_MS);
        try {
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
            if (!response.ok)
                throw new Error(`HTTP ${response.status}`);
            const results = (await response.json());
            const failed = results.find((item) => item.error);
            if (failed)
                throw new Error(failed.error);
            const count = Number(results[0]?.result ?? 0);
            const ttl = Number(results[2]?.result ?? windowMs);
            const resetAt = Date.now() + (ttl > 0 ? ttl : windowMs);
            return {
                allowed: count <= limit,
                remaining: Math.max(0, limit - count),
                resetAt,
            };
        }
        finally {
            clearTimeout(timer);
        }
    }
    consumeMemory(id, limit, windowMs) {
        const now = Date.now();
        let entry = this.memCache.get(id);
        if (!entry || entry.resetAt <= now) {
            entry = { count: 0, resetAt: now + windowMs };
            this.memCache.set(id, entry);
            if (this.memCache.size > MEM_MAX_ENTRIES)
                this.evictExpired(now, true);
        }
        if (entry.count >= limit) {
            return { allowed: false, remaining: 0, resetAt: entry.resetAt };
        }
        entry.count += 1;
        return { allowed: true, remaining: Math.max(0, limit - entry.count), resetAt: entry.resetAt };
    }
    evictExpired(now, enforceMax = false) {
        for (const [key, entry] of this.memCache) {
            if (entry.resetAt <= now)
                this.memCache.delete(key);
        }
        if (!enforceMax)
            return;
        while (this.memCache.size > MEM_MAX_ENTRIES) {
            const oldest = this.memCache.keys().next().value;
            if (!oldest)
                return;
            this.memCache.delete(oldest);
        }
    }
    toDocId(key) {
        return (0, node_crypto_1.createHash)('sha256').update(key).digest('hex');
    }
    getClientIp(request) {
        if (TRUST_PROXY_HEADERS) {
            const xff = request.headers['x-forwarded-for'];
            if (typeof xff === 'string' && xff.trim()) {
                const first = xff.split(',')[0]?.trim();
                if (first)
                    return first;
            }
            const realIp = request.headers['x-real-ip'];
            if (typeof realIp === 'string' && realIp.trim()) {
                return realIp.trim();
            }
        }
        return request.ip || 'unknown-ip';
    }
};
exports.RateLimitService = RateLimitService;
exports.RateLimitService = RateLimitService = RateLimitService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], RateLimitService);
