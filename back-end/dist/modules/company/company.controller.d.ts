import { Request } from 'express';
import { RequestUser } from '../../common/auth/request-user.type';
import { CompanyService } from './company.service';
export declare class CompanyController {
    private readonly companyService;
    constructor(companyService: CompanyService);
    create(request: Request, user: RequestUser, body: Record<string, unknown>): Promise<{
        name: string;
        userId: string;
        buildings: any[];
        createdAt: Date;
        id: string;
    }>;
    byId(request: Request, user: RequestUser, companyId: string): Promise<{
        id: string;
    }>;
    update(request: Request, user: RequestUser, companyId: string, body: Record<string, unknown>): Promise<{
        success: boolean;
    }>;
}
