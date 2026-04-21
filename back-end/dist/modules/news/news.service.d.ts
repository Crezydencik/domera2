import { Request } from 'express';
import { RequestUser } from '../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../common/infrastructure/firebase/firebase-admin.service';
import { RateLimitService } from '../../common/services/rate-limit.service';
export declare class NewsService {
    private readonly firebaseAdminService;
    private readonly rateLimitService;
    constructor(firebaseAdminService: FirebaseAdminService, rateLimitService: RateLimitService);
    private assertManagement;
    private enforceRateLimit;
    list(request: Request, user: RequestUser, companyId: string): Promise<{
        items: {
            id: string;
        }[];
    }>;
    byId(request: Request, user: RequestUser, newsId: string): Promise<{
        id: string;
    }>;
    create(request: Request, user: RequestUser, payload: Record<string, unknown>): Promise<{
        companyId: string;
        title: string;
        createdAt: Date;
        id: string;
    }>;
    update(request: Request, user: RequestUser, newsId: string, payload: Record<string, unknown>): Promise<{
        success: boolean;
    }>;
    remove(request: Request, user: RequestUser, newsId: string): Promise<{
        success: boolean;
    }>;
}
