import { Request } from 'express';
import { RequestUser } from '../../../common/auth/request-user.type';
import { BuildingCrudService } from '../services/building-crud.service';
export declare class BuildingsCrudController {
    private readonly buildingCrudService;
    constructor(buildingCrudService: BuildingCrudService);
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
        deletedRequest: boolean;
        backup?: undefined;
    } | {
        success: boolean;
        backup: import("../services/building-storage.service").BuildingDeleteBackupResult;
        deletedRequest?: undefined;
    }>;
}
