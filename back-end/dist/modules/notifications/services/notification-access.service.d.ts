import { Request } from 'express';
import { RequestUser } from '../../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { RateLimitService } from '../../../common/services/rate-limit.service';
export declare class NotificationAccessService {
    private readonly rateLimitService;
    private readonly firebaseAdminService;
    constructor(rateLimitService: RateLimitService, firebaseAdminService: FirebaseAdminService);
    assertAuth(user: RequestUser | undefined): asserts user is RequestUser;
    ensureUserAccess(currentUser: RequestUser, targetUserId: string): Promise<void>;
    enforceRateLimit(request: Request, scope: string, discriminator: string, limit: number): Promise<void>;
}
