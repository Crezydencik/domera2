import { OnModuleDestroy } from '@nestjs/common';
import { Request } from 'express';
export declare class RateLimitService implements OnModuleDestroy {
    private readonly memCache;
    private readonly cleanupTimer;
    constructor();
    onModuleDestroy(): void;
    consume(key: string, limit: number, windowMs: number): {
        allowed: boolean;
        remaining: number;
        resetAt: number;
    };
    buildKey(request: Request, routeScope: string, actorScope?: string): string;
    private toDocId;
    private getClientIp;
}
