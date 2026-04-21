import { Request } from 'express';
import { RequestUser } from '../../common/auth/request-user.type';
import { BuildingsService } from './buildings.service';
export declare class BuildingsController {
    private readonly buildingsService;
    constructor(buildingsService: BuildingsService);
    list(request: Request, user: RequestUser, companyId: string): Promise<{
        items: {
            id: string;
        }[];
    }>;
    byId(request: Request, user: RequestUser, buildingId: string): Promise<{
        id: string;
    }>;
    create(request: Request, user: RequestUser, body: Record<string, unknown>): Promise<{
        companyId: string;
        apartmentIds: any[];
        createdAt: Date;
        id: string;
    }>;
    update(request: Request, user: RequestUser, buildingId: string, body: Record<string, unknown>): Promise<{
        success: boolean;
    }>;
    remove(request: Request, user: RequestUser, buildingId: string): Promise<{
        success: boolean;
    }>;
}
