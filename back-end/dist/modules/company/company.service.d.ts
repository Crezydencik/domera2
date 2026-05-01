import { Request } from 'express';
import { FirebaseAdminService } from '../../common/infrastructure/firebase/firebase-admin.service';
import { RequestUser } from '../../common/auth/request-user.type';
import { RateLimitService } from '../../common/services/rate-limit.service';
export declare class CompanyService {
    private readonly firebaseAdminService;
    private readonly rateLimitService;
    constructor(firebaseAdminService: FirebaseAdminService, rateLimitService: RateLimitService);
    private assertAuthenticated;
    private enforceRateLimit;
    private normalizeCompanyPayload;
    create(request: Request, user: RequestUser, payload: Record<string, unknown>): Promise<{
        companyName: string;
        manager: any[];
        companyId: string;
        userIds: string[];
        buildings: any[];
        createdAt: Date;
        updatedAt: Date;
        id: string;
    }>;
    byId(request: Request, user: RequestUser, companyId: string): Promise<{
        id: string;
    }>;
    update(request: Request, user: RequestUser, companyId: string, payload: Record<string, unknown>): Promise<{
        success: boolean;
    }>;
}
