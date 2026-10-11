import { Request } from 'express';
import { FirebaseAdminService } from '../../../../common/infrastructure/firebase/firebase-admin.service';
import { RequestUser } from '../../../../common/auth/request-user.type';
import { AuditLogService } from '../../../../common/services/audit-log.service';
import { RateLimitService } from '../../../../common/services/rate-limit.service';
import { CompanyAccessService } from '../../services/company-access.service';
export declare class CompanyInvitationsService {
    private readonly firebaseAdminService;
    private readonly rateLimitService;
    private readonly auditLogService;
    private readonly companyAccessService;
    constructor(firebaseAdminService: FirebaseAdminService, rateLimitService: RateLimitService, auditLogService: AuditLogService, companyAccessService: CompanyAccessService);
    private assertManagerOrAccountant;
    private effectiveCompanyId;
    private assertCompanyScope;
    list(request: Request, user: RequestUser, companyId?: string, buildingId?: string): Promise<{
        invitations: {
            id: string;
        }[];
    }>;
    send(request: Request, user: RequestUser, payload: Record<string, unknown>): Promise<{
        success: boolean;
        invitationId: string;
    }>;
    accept(request: Request, user: RequestUser, payload: Record<string, unknown>): Promise<{
        success: boolean;
    }>;
}
