import { Request } from 'express';
import { RequestUser } from '../../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { RateLimitService } from '../../../common/services/rate-limit.service';
import { BuildingDeleteBackupResult, BuildingStorageService } from './building-storage.service';
import { BuildingPayloadService } from './building-payload.service';
import { BuildingStatsService } from './building-stats.service';
import { BuildingPlatformNotificationService } from './building-platform-notification.service';
import { CompanyPayloadService } from '../../company/services/company-payload.service';
export declare class BuildingCrudService {
    private readonly firebaseAdminService;
    private readonly rateLimitService;
    private readonly buildingPayloadService;
    private readonly buildingStorageService;
    private readonly buildingStatsService;
    private readonly platformNotificationService;
    private readonly companyPayloadService;
    constructor(firebaseAdminService: FirebaseAdminService, rateLimitService: RateLimitService, buildingPayloadService: BuildingPayloadService, buildingStorageService: BuildingStorageService, buildingStatsService: BuildingStatsService, platformNotificationService: BuildingPlatformNotificationService, companyPayloadService: CompanyPayloadService);
    list(request: Request, user: RequestUser, companyId: string): Promise<{
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
    byId(request: Request, user: RequestUser, buildingId: string): Promise<{
        apartmentLimit: number;
        approvedApartmentsCount: number;
        apartmentsCount: number;
        apartments: number;
        linkedApartmentsCount: number;
        actualApartmentsCount: number;
        occupiedApartments: number;
        id: string;
    }>;
    create(request: Request, user: RequestUser, payload: Record<string, unknown>): Promise<void>;
    update(request: Request, user: RequestUser, buildingId: string, payload: Record<string, unknown>): Promise<{
        success: boolean;
        deletedRequest: boolean;
    } | {
        success: boolean;
        deletedRequest?: undefined;
    }>;
    remove(request: Request, user: RequestUser, buildingId: string): Promise<{
        success: boolean;
        deletedRequest: boolean;
        backup?: undefined;
    } | {
        success: boolean;
        backup: BuildingDeleteBackupResult;
        deletedRequest?: undefined;
    }>;
    private assertManagement;
    private assertManagementCompanyMutation;
    private assertCanUpdateBuilding;
    private effectiveManagementCompanyId;
    private assertManagementCompanyScope;
    private enforceRateLimit;
    private firstString;
    private isBuildingCreationRequestStatus;
    private getCompanySummary;
    private buildCompanyBuildingLinkPatch;
}
