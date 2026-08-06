import { Request } from 'express';
import { RequestUser } from '../../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { RateLimitService } from '../../../common/services/rate-limit.service';
import { BuildingStatsService } from './building-stats.service';
export declare class BuildingAdminService {
    private readonly firebaseAdminService;
    private readonly rateLimitService;
    private readonly buildingStatsService;
    constructor(firebaseAdminService: FirebaseAdminService, rateLimitService: RateLimitService, buildingStatsService: BuildingStatsService);
    listAllForAdmin(request: Request, user: RequestUser): Promise<{
        items: {
            apartmentLimit: number;
            approvedApartmentsCount: number;
            apartmentsCount: number;
            apartments: number;
            linkedApartmentsCount: number;
            actualApartmentsCount: number;
            occupiedApartments: number;
            id: string;
        }[];
    }>;
    listPlatformBillingInvoices(request: Request, user: RequestUser): Promise<{
        items: Record<string, unknown>[];
    }>;
    setEditLock(request: Request, user: RequestUser, buildingId: string, payload: Record<string, unknown>): Promise<{
        success: boolean;
        buildingId: string;
        editLocked: boolean;
    }>;
    private assertPlatformAdmin;
    private enforceRateLimit;
    private firstString;
    private dateSortValue;
}
