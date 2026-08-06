import { Request } from 'express';
import { RequestUser } from '../../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { RateLimitService } from '../../../common/services/rate-limit.service';
import { BuildingPayloadService } from './building-payload.service';
import { BuildingStorageService } from './building-storage.service';
import { BuildingPlatformBillingService } from './building-platform-billing.service';
import { BuildingPlatformNotificationService } from './building-platform-notification.service';
export declare class BuildingCreationRequestService {
    private readonly firebaseAdminService;
    private readonly rateLimitService;
    private readonly buildingPayloadService;
    private readonly buildingStorageService;
    private readonly platformBillingService;
    private readonly platformNotificationService;
    constructor(firebaseAdminService: FirebaseAdminService, rateLimitService: RateLimitService, buildingPayloadService: BuildingPayloadService, buildingStorageService: BuildingStorageService, platformBillingService: BuildingPlatformBillingService, platformNotificationService: BuildingPlatformNotificationService);
    getCreationAccess(request: Request, user: RequestUser, companyId: string): Promise<{
        allowed: boolean;
        requiresSubscription: boolean;
        requiresCode: boolean;
        message: string | null;
    }>;
    requestCreationAccess(request: Request, user: RequestUser, payload: Record<string, unknown>): Promise<{
        success: boolean;
        alreadyPending: boolean;
        status: string;
        requestId: string;
        notifiedAdmins?: undefined;
    } | {
        success: boolean;
        alreadyPending: boolean;
        status: string;
        requestId?: undefined;
        notifiedAdmins?: undefined;
    } | {
        success: boolean;
        status: string;
        notifiedAdmins: number;
        alreadyPending?: undefined;
        requestId?: undefined;
    }>;
    reviewCreationRequest(request: Request, user: RequestUser, requestId: string, approved: boolean, options?: Record<string, unknown>): Promise<{
        success: boolean;
        status: string;
        requestId: string;
        buildingId: string;
        billingInvoiceId: string | undefined;
    }>;
    cancelCreationAccessRequest(request: Request, user: RequestUser, requestId: string): Promise<{
        success: boolean;
        status: string;
        requestId: string;
    }>;
    private assertManagement;
    private effectiveManagementCompanyId;
    private assertManagementCompanyScope;
    private enforceRateLimit;
    private firstString;
    private optionalNonNegativeNumber;
    private getCompanySummary;
    private getCompanyCreationAccess;
    private buildCompanyBuildingLinkPatch;
}
