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
        message: null;
    }>;
    list(request: Request, user: RequestUser, companyId: string): Promise<{
        items: {
            apartmentsCount: number;
            occupiedApartments: number;
            id: string;
        }[];
    }>;
    byId(request: Request, user: RequestUser, buildingId: string): Promise<{
        apartmentsCount: number;
        occupiedApartments: number;
        id: string;
    }>;
    create(request: Request, user: RequestUser, body: Record<string, unknown>): Promise<{
        createdAt: Date;
        updatedAt: Date;
        name: string;
        title: string;
        address: string;
        street: string;
        location: string;
        companyId: string;
        managedBy: {
            companyId: string;
            companyName: string;
            companyEmail?: string;
            companyPhone?: string;
        };
        apartmentsCount: number;
        apartmentIds: string[];
        status: string;
        readingConfig: {
            waterEnabled: boolean;
            electricityEnabled: boolean;
            heatingEnabled: boolean;
            hotWaterMetersPerResident: number;
            coldWaterMetersPerResident: number;
            submissionPeriod: {
                startDate: string;
                endDate: string;
                monthly: boolean;
            } | null;
        };
        id: string;
    }>;
    update(request: Request, user: RequestUser, buildingId: string, body: Record<string, unknown>): Promise<{
        success: boolean;
    }>;
    remove(request: Request, user: RequestUser, buildingId: string): Promise<{
        success: boolean;
    }>;
}
