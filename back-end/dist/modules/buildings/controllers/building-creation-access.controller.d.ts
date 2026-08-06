import { Request } from 'express';
import { RequestUser } from '../../../common/auth/request-user.type';
import { BuildingCreationRequestService } from '../services/building-creation-request.service';
export declare class BuildingCreationAccessController {
    private readonly creationRequestService;
    constructor(creationRequestService: BuildingCreationRequestService);
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
}
