import { Request } from 'express';
import { RequestUser } from '../../common/auth/request-user.type';
import { UsersService } from './users.service';
export declare class UsersController {
    private readonly usersService;
    constructor(usersService: UsersService);
    me(request: Request, user: RequestUser): Promise<{
        id: string;
        uid: string;
        email: string | undefined;
        role: "ManagementCompany" | "Accountant" | "Resident" | "Landlord" | undefined;
        accountType: "ManagementCompany" | "Resident" | "Landlord" | undefined;
        companyId: string | undefined;
        apartmentId: string | undefined;
    } | {
        id: string;
        uid?: undefined;
        email?: undefined;
        role?: undefined;
        accountType?: undefined;
        companyId?: undefined;
        apartmentId?: undefined;
    }>;
    byId(request: Request, user: RequestUser, userId: string): Promise<{
        id: string;
    } | null>;
    byEmail(request: Request, user: RequestUser, email: string): Promise<{
        id: string;
    } | null>;
    listByCompany(request: Request, user: RequestUser, companyId: string): Promise<{
        items: {
            id: string;
        }[];
    }>;
    upsert(request: Request, user: RequestUser, userId: string, body: Record<string, unknown>): Promise<{
        success: boolean;
    }>;
    update(request: Request, user: RequestUser, userId: string, body: Record<string, unknown>): Promise<{
        success: boolean;
    }>;
}
