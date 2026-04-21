import { Request } from 'express';
import { FirebaseAdminService } from '../../common/infrastructure/firebase/firebase-admin.service';
import { RequestUser } from '../../common/auth/request-user.type';
import { AuditLogService } from '../../common/services/audit-log.service';
import { RateLimitService } from '../../common/services/rate-limit.service';
export declare class CompanyInvitationsService {
    private readonly firebaseAdminService;
    private readonly rateLimitService;
    private readonly auditLogService;
    constructor(firebaseAdminService: FirebaseAdminService, rateLimitService: RateLimitService, auditLogService: AuditLogService);
    private assertManagerOrAccountant;
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
