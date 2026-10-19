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
    migrateCanonicalScope(params: {
        request: Request;
        user: RequestUser;
        cursor?: string;
        limit?: number;
        apply: boolean;
    }): Promise<{
        mode: string;
        scanned: number;
        eligible: number;
        updated: number;
        alreadyCanonical: number;
        skipped: {
            buildingId: string;
            reason: string;
        }[];
        remaining: number;
        hasMore: boolean;
        nextCursor: string | undefined;
    }>;
    private decodeMigrationCursor;
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
    private dateSortValue;
}
