import { Request } from 'express';
import { RequestUser } from '../../common/auth/request-user.type';
import { CompanyService } from './company.service';
export declare class CompanyController {
    private readonly companyService;
    constructor(companyService: CompanyService);
    create(request: Request, user: RequestUser, body: Record<string, unknown>): Promise<{
        companyName: string;
        manager: any[];
        companyId: string;
        userIds: string[];
        buildings: any[];
        createdAt: Date;
        updatedAt: Date;
        id: string;
    }>;
    byId(request: Request, user: RequestUser, companyId: string): Promise<{
        id: string;
    }>;
    update(request: Request, user: RequestUser, companyId: string, body: Record<string, unknown>): Promise<{
        success: boolean;
    }>;
    addMember(request: Request, user: RequestUser, companyId: string, body: Record<string, unknown>): Promise<{
        success: boolean;
        mode: string;
        invitation: {
            invitationId: string;
            invitationLink: string;
        };
        member?: undefined;
    } | {
        success: boolean;
        mode: string;
        member: {
            id: string;
            uid: string;
            email: string;
            firstName: string;
            lastName: string;
            fullName: string;
            role: "ManagementCompany" | "Accountant";
            accountType: "ManagementCompany" | "Resident" | "Landlord";
            companyId: string;
        };
        invitation?: undefined;
    }>;
    removeMember(request: Request, user: RequestUser, companyId: string, memberId: string): Promise<{
        success: boolean;
        memberId: string;
    }>;
}
