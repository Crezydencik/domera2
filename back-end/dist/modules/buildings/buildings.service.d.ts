import { Request } from 'express';
import { RequestUser } from '../../common/auth/request-user.type';
import { BuildingCreationRequestService } from './services/building-creation-request.service';
import { BuildingCrudService } from './services/building-crud.service';
export declare class BuildingsService {
    private readonly creationRequestService;
    private readonly buildingCrudService;
    constructor(creationRequestService: BuildingCreationRequestService, buildingCrudService: BuildingCrudService);
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
        backup: import("./services/building-storage.service").BuildingDeleteBackupResult;
        deletedRequest?: undefined;
    }>;
}
