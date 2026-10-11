import { Request } from 'express';
import { RequestUser } from '../../../common/auth/request-user.type';
import { ApartmentsService } from '../apartments.service';
export declare class ApartmentAdminController {
    private readonly apartmentsService;
    constructor(apartmentsService: ApartmentsService);
    auditLogs(request: Request, user: RequestUser, apartmentId: string, limit?: string): Promise<{
        items: {
            createdAt: string;
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
    canonicalScopeMigration(request: Request, user: RequestUser, cursor?: string, limit?: string, apply?: string): Promise<{
        mode: string;
        scanned: number;
        eligible: number;
        updated: number;
        alreadyCanonical: number;
        skipped: {
            apartmentId: string;
            reason: string;
        }[];
        hasMore: boolean;
        nextCursor: string | undefined;
    }>;
}
