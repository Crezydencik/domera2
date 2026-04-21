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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimitService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
let RateLimitService = class RateLimitService {
    constructor() {
        this.memCache = new Map();
        this.cleanupTimer = setInterval(() => {
            const now = Date.now();
            for (const [key, entry] of this.memCache.entries()) {
                if (entry.resetAt <= now)
                    this.memCache.delete(key);
            }
        }, 60_000);
    }
    onModuleDestroy() {
        clearInterval(this.cleanupTimer);
    }
    consume(key, limit, windowMs) {
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
    buildKey(request, routeScope, actorScope) {
        return `${routeScope}:${actorScope ?? 'anon'}:${this.getClientIp(request)}`;
    }
    toDocId(key) {
        return (0, node_crypto_1.createHash)('sha256').update(key).digest('hex');
    }
    getClientIp(request) {
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
        return request.ip || 'unknown-ip';
    }
};
exports.RateLimitService = RateLimitService;
exports.RateLimitService = RateLimitService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], RateLimitService);
