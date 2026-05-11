import { Request } from 'express';
import { RequestUser } from '../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../common/infrastructure/firebase/firebase-admin.service';
import { RateLimitService } from '../../common/services/rate-limit.service';
export declare class UsersService {
    private readonly firebaseAdminService;
    private readonly rateLimitService;
    constructor(firebaseAdminService: FirebaseAdminService, rateLimitService: RateLimitService);
    private assertAuth;
    private isStaff;
    private ensureUserAccess;
    private ensureCompanyAccess;
    private normalizeProfilePayload;
    private enforceRateLimit;
    byId(request: Request, user: RequestUser, userId: string): Promise<{
        id: string;
    } | null>;
    me(request: Request, user: RequestUser): Promise<{
        id: string;
        uid: string;
        email: string | undefined;
        role: "ManagementCompany" | "Accountant" | "Resident" | "Landlord" | undefined;
        accountType: "ManagementCompany" | "Resident" | "Landlord" | undefined;
        companyId: string | undefined;
        apartmentId: string | undefined;
    } | {
        id: string;
        uid?: undefined;
        email?: undefined;
        role?: undefined;
        accountType?: undefined;
        companyId?: undefined;
        apartmentId?: undefined;
    }>;
    byEmail(request: Request, user: RequestUser, email: string): Promise<{
        id: string;
    } | null>;
    listByCompany(request: Request, user: RequestUser, companyId: string): Promise<{
        items: {
            id: string;
        }[];
    }>;
    upsert(request: Request, user: RequestUser, userId: string, payload: Record<string, unknown>): Promise<{
        success: boolean;
    }>;
    update(request: Request, user: RequestUser, userId: string, payload: Record<string, unknown>): Promise<{
        success: boolean;
    }>;
}
