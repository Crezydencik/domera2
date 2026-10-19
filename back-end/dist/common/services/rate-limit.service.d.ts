import { OnModuleDestroy } from '@nestjs/common';
import { Request } from 'express';
export type RateLimitResult = {
    allowed: boolean;
    remaining: number;
    resetAt: number;
};
export declare class RateLimitService implements OnModuleDestroy {
    private readonly logger;
    private readonly memCache;
    private readonly cleanupTimer;
    private readonly redisEnabled;
    constructor();
    onModuleDestroy(): void;
    consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
    enforce(request: Request, routeScope: string, actorScope: string | undefined, limit: number, windowMs?: number): Promise<void>;
    buildKey(request: Request, routeScope: string, actorScope?: string): string;
    private consumeRedis;
    private consumeMemory;
    private evictExpired;
    private toDocId;
    private getClientIp;
}
