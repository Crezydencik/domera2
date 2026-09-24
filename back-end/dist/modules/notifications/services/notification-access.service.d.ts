import { Request } from 'express';
import { RequestUser } from '../../../common/auth/request-user.type';
import { RateLimitService } from '../../../common/services/rate-limit.service';
export declare class NotificationAccessService {
    private readonly rateLimitService;
    constructor(rateLimitService: RateLimitService);
    assertAuth(user: RequestUser | undefined): asserts user is RequestUser;
    ensureUserAccess(currentUser: RequestUser, targetUserId: string): void;
    enforceRateLimit(request: Request, scope: string, discriminator: string, limit: number): Promise<void>;
}
