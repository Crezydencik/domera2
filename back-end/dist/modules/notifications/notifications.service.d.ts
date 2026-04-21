import { Request } from 'express';
import { RequestUser } from '../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../common/infrastructure/firebase/firebase-admin.service';
import { RateLimitService } from '../../common/services/rate-limit.service';
export declare class NotificationsService {
    private readonly firebaseAdminService;
    private readonly rateLimitService;
    constructor(firebaseAdminService: FirebaseAdminService, rateLimitService: RateLimitService);
    private assertAuth;
    private ensureUserAccess;
    private enforceRateLimit;
    list(request: Request, user: RequestUser, userId: string): Promise<{
        items: ({
            id: string;
        } & Record<string, unknown>)[];
    }>;
    create(request: Request, user: RequestUser, payload: Record<string, unknown>): Promise<{
        userId: string;
        read: boolean;
        createdAt: Date;
        id: string;
    }>;
    markRead(request: Request, user: RequestUser, notificationId: string): Promise<{
        success: boolean;
    }>;
    markAllRead(request: Request, user: RequestUser, userId: string): Promise<{
        success: boolean;
        updated: number;
    }>;
    remove(request: Request, user: RequestUser, notificationId: string): Promise<{
        success: boolean;
    }>;
}
