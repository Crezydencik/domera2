import { Request } from 'express';
import { RequestUser } from '../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../common/infrastructure/firebase/firebase-admin.service';
import { RateLimitService } from '../../common/services/rate-limit.service';
import { AuditLogService } from '../../common/services/audit-log.service';
export declare class InvoicesService {
    private readonly firebaseAdminService;
    private readonly rateLimitService;
    private readonly auditLogService;
    constructor(firebaseAdminService: FirebaseAdminService, rateLimitService: RateLimitService, auditLogService: AuditLogService);
    private assertAuthenticated;
    private isStaff;
    private getAccessibleApartmentIds;
    create(request: Request, user: RequestUser, payload: Record<string, unknown>): Promise<{
        success: boolean;
        invoice: {
            apartmentId: string;
            month: number;
            year: number;
            amount: number;
            status: string;
            pdfUrl: string;
            companyId: string;
            buildingId: string | null;
            createdAt: Date;
            createdByUid: string;
            id: string;
        };
    }>;
    list(user: RequestUser, query: Record<string, string | undefined>): Promise<{
        items: Record<string, unknown>[];
        query: Record<string, string | undefined>;
    } | {
        items: {
            id: string;
        }[];
        query: Record<string, string | undefined>;
    }>;
    byId(user: RequestUser, invoiceId: string): Promise<{
        id: string;
    }>;
    update(request: Request, user: RequestUser, invoiceId: string, payload: Record<string, unknown>): Promise<{
        success: boolean;
    }>;
    remove(request: Request, user: RequestUser, invoiceId: string): Promise<{
        success: boolean;
    }>;
}
