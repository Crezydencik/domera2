import { Request } from 'express';
import { RequestUser } from '../../../common/auth/request-user.type';
import { BuildingAdminService } from '../services/building-admin.service';
export declare class BuildingsAdminController {
    private readonly buildingAdminService;
    constructor(buildingAdminService: BuildingAdminService);
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
    setEditLock(request: Request, user: RequestUser, buildingId: string, body: Record<string, unknown>): Promise<{
        success: boolean;
        buildingId: string;
        editLocked: boolean;
    }>;
}
