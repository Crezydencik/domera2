import { Request } from 'express';
import { RequestUser } from '../../common/auth/request-user.type';
import { UsersService } from './users.service';
export declare class UsersController {
    private readonly usersService;
    constructor(usersService: UsersService);
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
