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

const statusLabels: Record<AuditStatus, string> = {
  success: 'Success',
  denied: 'Denied',
  rate_limited: 'Rate limited',
  error: 'Error',
};

const actionLabels: Record<string, string> = {
  'apartments.import': 'Apartments imported',
  removeOwner: 'Apartment owner removed',
  resendOwnerInvitation: 'Owner invitation resent',
  resendTenantInvitation: 'Tenant invitation resent',
  updateOwner: 'Apartment owner updated',
  'auth.email_change_confirm': 'Email change confirmed',
  'auth.email_change_request': 'Email change requested',
  'auth.login': 'User signed in',
  'auth.password_change': 'Password changed',
  'auth.password_reset_confirm': 'Password reset confirmed',
  'auth.password_reset_preview': 'Password reset opened',
  'auth.password_reset_send': 'Password reset email sent',
  'auth.register': 'User registered',
  'auth.register_code.request': 'Registration code requested',
  'auth.register_code.verify': 'Registration code verified',
  'company.api_key.create': 'Company API key created',
  'company.api_key.delete': 'Company API key deleted',
  'company_invitation.accept': 'Company invitation accepted',
  'company_invitation.send': 'Company invitation sent',
  'invitation.list': 'Invitations viewed',
  'invitation.resolve': 'Invitation link checked',
  'invitation.revoke': 'Invitation revoked',
  'invitation.send': 'Invitation sent',
  'invoice.approve_api_upload': 'Invoice API upload approved',
  'invoice.cancel_api_upload': 'Invoice API upload cancelled',
  'invoice.create': 'Invoice created',
  'invoice.delete': 'Invoice deleted',
  'invoice.email_resend': 'Invoice email resent',
  'invoice.upload': 'Invoice uploaded',
  'invoice.upload_batch': 'Invoice batch uploaded',
  'invoice.upload_pending_approval': 'Invoice upload awaiting approval',
  'meter_reading.submit': 'Meter reading submitted',
};

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly firebaseAdminService: FirebaseAdminService) {}

  private toActionLabel(action: string): string {
    if (actionLabels[action]) return actionLabels[action];

    return action
      .replace(/[._-]+/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^./, (letter) => letter.toUpperCase());
  }

  private buildEventDescription(event: AuditEventInput, actionLabel: string): string {
    const metadata = event.metadata ?? {};
    const details: string[] = [];

    if (event.status === 'success') {
      details.push(actionLabel);
    } else {
      details.push(`${actionLabel} (${statusLabels[event.status]})`);
    }

    if (event.reason) {
      details.push(`Reason: ${event.reason}`);
    }

    const buildingLabel = typeof metadata.buildingLabel === 'string' ? metadata.buildingLabel.trim() : '';
    const apartmentLabel = typeof metadata.apartmentLabel === 'string' ? metadata.apartmentLabel.trim() : '';
    if (buildingLabel || apartmentLabel) {
      details.push(`Place: ${[buildingLabel, apartmentLabel].filter(Boolean).join(', ')}`);
    } else if (event.apartmentId) {
      details.push(`Apartment ID: ${event.apartmentId}`);
    }

    if (event.companyId) {
      details.push(`Company ID: ${event.companyId}`);
    }

    if (event.invitationId) {
      details.push(`Invitation ID: ${event.invitationId}`);
    }

    if (event.actorUid) {
      details.push(`Actor: ${event.actorUid}${event.actorRole ? ` (${event.actorRole})` : ''}`);
    } else {
      details.push('Actor: not signed in');
    }

    return details.join('. ');
  }

  private buildLogEntry(event: AuditEventInput, timestampField: 'timestamp' | 'createdAt') {
    const { request, ...safeEvent } = event;
    const actionLabel = this.toActionLabel(event.action);

    return {
      ...safeEvent,
      eventTitle: actionLabel,
      eventDescription: this.buildEventDescription(event, actionLabel),
      actionLabel,
      statusLabel: statusLabels[event.status],
      actorLabel: event.actorUid
        ? `${event.actorUid}${event.actorRole ? ` (${event.actorRole})` : ''}`
        : 'Not signed in',
      ip: request?.ip ?? null,
      userAgent: request?.headers['user-agent'] ?? null,
      [timestampField]: new Date(),
    };
  }

  /**
   * Generate a readable document ID from apartmentId, apartment number, and company ID
   * Format: AUDITAPT<companyCode><apartmentNumber><apartmentIdHash>
   * Example: AUDITAPTABC423D4E5F or AUDITAPTABCAX23D4E5F (if no apartment number)
   */
  private generateReadableId(
    apartmentId: string,
    apartmentNumber?: string | number,
    companyId?: string,
  ): string {
    // Company code: take first 3 uppercase letters/digits from companyId, or use "UNK"
    const companyCode = companyId
      ? companyId.substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, 'X')
      : 'UNK';

    // Apartment number: use provided number or generate from first + last chars of apartmentId
    let aptNum: string;
    if (apartmentNumber) {
      aptNum = String(apartmentNumber).substring(0, 3).toUpperCase();
    } else {
      // If no apartment number, use first and last character + random character from apartmentId
      const first = apartmentId.charAt(0).toUpperCase();
      const last = apartmentId.charAt(apartmentId.length - 1).toUpperCase();
      const middle = apartmentId.charAt(Math.floor(apartmentId.length / 2)).toUpperCase();
      aptNum = `${first}${middle}${last}`;
    }

    // Take last 6 characters of apartmentId for unique hash
    const idHash = apartmentId.slice(-6).toUpperCase();

    return `AUDITAPT${companyCode}${aptNum}${idHash}`;
  }

  async write(event: AuditEventInput): Promise<void> {
    try {
      // If apartmentId exists, use a readable document ID
      if (event.apartmentId) {
        let apartmentNumber: string | number | undefined = event.metadata?.apartmentNumber as
          | string
          | number
          | undefined;

        // If no apartment number in metadata, fetch from Firestore
        if (!apartmentNumber) {
          try {
            const apartmentSnap = await this.firebaseAdminService.firestore
              .collection('apartments')
              .doc(event.apartmentId)
              .get();

            if (apartmentSnap.exists) {
              const apartmentData = apartmentSnap.data() as Record<string, unknown>;
              const number = apartmentData.number;
              if (typeof number === 'string' || typeof number === 'number') {
                apartmentNumber = number;
              }
            }
          } catch (error) {
            this.logger.debug(`Failed to fetch apartment number for ${event.apartmentId}`);
          }
        }

        const readableDocId = this.generateReadableId(
          event.apartmentId,
          apartmentNumber,
          event.companyId,
        );
        
        const logEntry = this.buildLogEntry(event, 'timestamp');

        const docRef = this.firebaseAdminService.firestore
          .collection('audit_logs')
          .doc(readableDocId);

        const docSnap = await docRef.get();
        
        if (docSnap.exists) {
          // Document exists, append to history
          const existingData = docSnap.data() as Record<string, unknown>;
          const history = Array.isArray(existingData.history) ? existingData.history : [];
          
          await docRef.set(
            {
              ...logEntry,
              apartmentId: event.apartmentId,
              history: [...history, logEntry],
              updatedAt: new Date(),
            },
            { merge: true },
          );
        } else {
          // Document doesn't exist, create new with history array
          await docRef.set({
            ...logEntry,
            apartmentId: event.apartmentId,
            history: [logEntry],
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
      } else {
        // No apartmentId, use traditional add() method
        await this.firebaseAdminService.firestore
          .collection('audit_logs')
          .add(this.buildLogEntry(event, 'createdAt'));
      }
    } catch (error) {
      this.logger.warn(
        `audit.log.write.failed action=${event.action} status=${event.status} reason=${
          error instanceof Error ? error.message : 'unknown_error'
        }`,
      );
    }
  }
}
