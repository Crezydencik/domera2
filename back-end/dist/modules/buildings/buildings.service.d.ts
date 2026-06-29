import { Request } from 'express';
import { FirebaseAdminService } from '../../common/infrastructure/firebase/firebase-admin.service';
import { RequestUser } from '../../common/auth/request-user.type';
import { RateLimitService } from '../../common/services/rate-limit.service';
export declare class BuildingsService {
    private readonly firebaseAdminService;
    private readonly rateLimitService;
    constructor(firebaseAdminService: FirebaseAdminService, rateLimitService: RateLimitService);
    private assertManagement;
    private assertPlatformAdmin;
    private enforceRateLimit;
    private firstString;
    private firstNumber;
    private dateSortValue;
    private sanitizePathSegment;
    private optionalNonNegativeNumber;
    private normalizeStatus;
    private isBuildingCreationRequestStatus;
    private normalizeMeterCount;
    private normalizeSubscriptionTermMonths;
    private normalizeSubscriptionTermYears;
    private normalizeReadingConfig;
    private normalizeSubmissionPeriod;
    private buildReadablePrefix;
    private buildSecureRandomToken;
    private generateBuildingId;
    private isApartmentOccupied;
    private getBuildingOccupancyStats;
    private getAllBuildingOccupancyStats;
    private buildingHasLinkedApartments;
    private applyOccupancyStats;
    private getCompanySummary;
    private getPlatformAdminDocs;
    private platformAdminCreationRequestNotificationRef;
    private markPlatformAdminCreationRequestNotificationsRead;
    private buildPlatformBillingInvoiceId;
    private buildPlatformBillingInvoiceNumber;
    private createPlatformBillingInvoice;
    private notifyPlatformAdminsAboutCreationRequest;
    private getCompanyCreationAccess;
    private getCompanyStorageFolders;
    private getBuildingStorageFolders;
    private addDays;
    private toBackupJson;
    private queryBuildingBackupDocs;
    private getBuildingSubcollectionBackup;
    private backupBuildingBeforeDelete;
    private markStorageFolders;
    private buildCompanyBuildingLinkPatch;
    private normalizeBuildingPayload;
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
    list(request: Request, user: RequestUser, companyId: string): Promise<{
        items: {
            apartmentLimit: number;
            approvedApartmentsCount: number;
            apartmentsCount: number;
            occupiedApartments: number;
            id: string;
        }[];
    }>;
    listAllForAdmin(request: Request, user: RequestUser): Promise<{
        items: {
            apartmentLimit: number;
            approvedApartmentsCount: number;
            apartmentsCount: number;
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
    byId(request: Request, user: RequestUser, buildingId: string): Promise<{
        apartmentLimit: number;
        approvedApartmentsCount: number;
        apartmentsCount: number;
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
        backup: {
            backupStoragePath: string;
            backupStoragePrefix: string;
            retainedStoragePrefix: string;
            retentionExpiresAt: Date;
            copiedStorageFilesCount: number;
        };
    }>;
}
