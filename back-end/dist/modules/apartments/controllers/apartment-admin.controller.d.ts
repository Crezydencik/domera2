import { Request } from 'express';
import { RequestUser } from '../../../common/auth/request-user.type';
import { ApartmentsService } from '../apartments.service';
export declare class ApartmentAdminController {
    private readonly apartmentsService;
    constructor(apartmentsService: ApartmentsService);
    auditLogs(request: Request, user: RequestUser, apartmentId: string, limit?: string): Promise<{
        items: {
            createdAt: any;
            id: string;
        }[];
    }>;
    migrateReadableIds(user: RequestUser): Promise<{
        updated: number;
        total: number;
        skipped: number;
        errors: Array<{
            apartmentId: string;
            message: string;
        }>;
    }>;
}
