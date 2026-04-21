import { Request } from 'express';
import { FirebaseAdminService } from '../../common/infrastructure/firebase/firebase-admin.service';
import { RequestUser } from '../../common/auth/request-user.type';
import { AuditLogService } from '../../common/services/audit-log.service';
import { RateLimitService } from '../../common/services/rate-limit.service';
export declare class InvitationsService {
    private readonly firebaseAdminService;
    private readonly rateLimitService;
    private readonly auditLogService;
    constructor(firebaseAdminService: FirebaseAdminService, rateLimitService: RateLimitService, auditLogService: AuditLogService);
    private enforceRateLimit;
    private assertStaff;
    private assertHouseholdOrStaff;
    send(request: Request, user: RequestUser, payload: Record<string, unknown>): Promise<{
        success: boolean;
        invitationId: string;
        invitationLink: string;
    }>;
    resolve(request: Request, token: string): Promise<{
        invitation: {
            id: string;
            email: string;
            apartmentId: string | null;
            status: string;
            expiresAt: string | null;
        };
        existingAccountDetected: boolean;
    }>;
    accept(request: Request, user: RequestUser | undefined, payload: Record<string, unknown>): Promise<{
        success: boolean;
        mode: string;
    }>;
    listByCompany(request: Request, user: RequestUser, companyId: string): Promise<{
        items: {
            id: string;
            companyId: string | undefined;
            apartmentId: string;
            email: string;
            status: string;
            token: string | undefined;
            tokenHash: string | undefined;
            invitedByUid: string | undefined;
            createdAt: Date;
            expiresAt: Date | undefined;
        }[];
    }>;
    findByEmail(request: Request, user: RequestUser, email: string): Promise<{
        invitation: null;
    } | {
        invitation: {
            id: string;
            companyId: string | undefined;
            apartmentId: string;
            email: string;
            status: string;
            token: string | undefined;
            tokenHash: string | undefined;
            invitedByUid: string | undefined;
            createdAt: Date;
            expiresAt: Date | undefined;
        };
    }>;
    revoke(request: Request, user: RequestUser, invitationId: string): Promise<{
        success: boolean;
    }>;
}
