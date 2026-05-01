import { Request } from 'express';
import { FirebaseAdminService } from '../infrastructure/firebase/firebase-admin.service';
export type AuditStatus = 'success' | 'denied' | 'rate_limited' | 'error';
export type AuditEventInput = {
    request?: Request;
    action: string;
    status: AuditStatus;
    reason?: string;
    actorUid?: string;
    actorRole?: string;
    companyId?: string;
    apartmentId?: string;
    invitationId?: string;
    targetEmail?: string;
    metadata?: Record<string, unknown>;
};
export declare class AuditLogService {
    private readonly firebaseAdminService;
    private readonly logger;
    constructor(firebaseAdminService: FirebaseAdminService);
    private generateReadableId;
    write(event: AuditEventInput): Promise<void>;
}
