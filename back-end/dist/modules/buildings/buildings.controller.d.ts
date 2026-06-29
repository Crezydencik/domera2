import { Request } from 'express';
import { RequestUser } from '../../common/auth/request-user.type';
import { BuildingsService } from './buildings.service';
export declare class BuildingsController {
    private readonly buildingsService;
    constructor(buildingsService: BuildingsService);
    creationAccess(request: Request, user: RequestUser, companyId: string): Promise<{
        allowed: boolean;
        requiresSubscription: boolean;
        requiresCode: boolean;
        message: string | null;
    }>;
    requestCreationAccess(request: Request, user: RequestUser, body: Record<string, unknown>): Promise<{
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
    setEditLock(request: Request, user: RequestUser, buildingId: string, body: Record<string, unknown>): Promise<{
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
    create(request: Request, user: RequestUser, body: Record<string, unknown>): Promise<void>;
    update(request: Request, user: RequestUser, buildingId: string, body: Record<string, unknown>): Promise<{
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
