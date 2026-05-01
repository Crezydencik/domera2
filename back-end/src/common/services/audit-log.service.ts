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
        
        const logEntry = {
          ...event,
          ip: event.request?.ip ?? null,
          userAgent: event.request?.headers['user-agent'] ?? null,
          timestamp: new Date(),
        };

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
        await this.firebaseAdminService.firestore.collection('audit_logs').add({
          ...event,
          ip: event.request?.ip ?? null,
          userAgent: event.request?.headers['user-agent'] ?? null,
          createdAt: new Date(),
        });
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
