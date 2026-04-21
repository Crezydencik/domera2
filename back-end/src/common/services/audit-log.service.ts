import { Injectable, Logger } from '@nestjs/common';
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

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly firebaseAdminService: FirebaseAdminService) {}

  async write(event: AuditEventInput): Promise<void> {
    try {
      await this.firebaseAdminService.firestore.collection('audit_logs').add({
        ...event,
        ip: event.request?.ip ?? null,
        userAgent: event.request?.headers['user-agent'] ?? null,
        createdAt: new Date(),
      });
    } catch (error) {
      this.logger.warn(
        `audit.log.write.failed action=${event.action} status=${event.status} reason=${
          error instanceof Error ? error.message : 'unknown_error'
        }`,
      );
    }
  }
}
