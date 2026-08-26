import { Injectable, Logger } from '@nestjs/common';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';

export type EmailLogType =
  | 'registrationCode'
  | 'passwordReset'
  | 'ownerInvitation'
  | 'tenantInvitation'
  | 'tenantInvitedByOwner'
  | 'invoiceGenerated'
  | 'meterReadingReminder'
  | 'notification';

export type EmailLogStatus = 'success' | 'error';

export type EmailLogInput = {
  type: EmailLogType;
  status: EmailLogStatus;
  to: string;
  subject: string;
  providerMessageId?: string;
  errorMessage?: string;
  deliveryKey?: string;
  companyId?: string;
  buildingId?: string;
  apartmentId?: string;
  metadata?: Record<string, unknown>;
};

export type EmailDeliveryLogItem = {
  id: string;
  type: EmailLogType | 'unknown';
  status: EmailLogStatus;
  to: string;
  subject: string;
  createdAt: string | null;
  errorMessage?: string;
  deliveryKey?: string;
  companyId?: string;
  buildingId?: string;
  apartmentId?: string;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class EmailLogService {
  private readonly logger = new Logger(EmailLogService.name);

  constructor(private readonly firebaseAdminService: FirebaseAdminService) {}

  async record(input: EmailLogInput): Promise<void> {
    try {
      await this.firebaseAdminService.firestore.collection('email_logs').add({
        ...input,
        to: input.to.trim().toLowerCase(),
        createdAt: new Date(),
      });
    } catch (error) {
      this.logger.warn(
        `email.log.write.failed type=${input.type} status=${input.status} reason=${
          error instanceof Error ? error.message : 'unknown_error'
        }`,
      );
    }
  }

  async getStats(query: {
    type?: EmailLogType;
    companyId?: string;
    buildingId?: string;
    apartmentId?: string;
  }) {
    let ref: FirebaseFirestore.Query = this.firebaseAdminService.firestore.collection('email_logs');

    if (query.type) ref = ref.where('type', '==', query.type);
    if (query.companyId) ref = ref.where('companyId', '==', query.companyId);
    if (query.buildingId) ref = ref.where('buildingId', '==', query.buildingId);
    if (query.apartmentId) ref = ref.where('apartmentId', '==', query.apartmentId);

    const snapshot = await ref.get();
    const now = Date.now();
    const last30DaysStart = now - 30 * 24 * 60 * 60 * 1000;
    const stats = {
      total: 0,
      success: 0,
      error: 0,
      last30Days: {
        total: 0,
        success: 0,
        error: 0,
      },
      byType: {} as Record<string, { total: number; success: number; error: number }>,
      lastSentAt: null as string | null,
    };

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      const type = typeof data.type === 'string' ? data.type : 'unknown';
      const status = data.status === 'success' ? 'success' : 'error';
      const createdAt = this.toDate(data.createdAt);

      stats.total += 1;
      stats[status] += 1;
      stats.byType[type] ??= { total: 0, success: 0, error: 0 };
      stats.byType[type].total += 1;
      stats.byType[type][status] += 1;

      if (createdAt) {
        if (!stats.lastSentAt || createdAt.getTime() > new Date(stats.lastSentAt).getTime()) {
          stats.lastSentAt = createdAt.toISOString();
        }

        if (createdAt.getTime() >= last30DaysStart) {
          stats.last30Days.total += 1;
          stats.last30Days[status] += 1;
        }
      }
    });

    return stats;
  }

  async hasSuccessfulDeliveryKey(deliveryKey: string): Promise<boolean> {
    const normalizedKey = deliveryKey.trim();
    if (!normalizedKey) return false;

    const snapshot = await this.firebaseAdminService.firestore
      .collection('email_logs')
      .where('deliveryKey', '==', normalizedKey)
      .limit(10)
      .get();

    return snapshot.docs.some((doc) => doc.data().status === 'success');
  }

  async getDeliveries(query: {
    type?: EmailLogType;
    companyId?: string;
    buildingId?: string;
    apartmentId?: string;
    deliveryKeyPrefix?: string;
    limit?: number;
  }) {
    let ref: FirebaseFirestore.Query = this.firebaseAdminService.firestore.collection('email_logs');

    if (query.type) ref = ref.where('type', '==', query.type);
    if (query.companyId) ref = ref.where('companyId', '==', query.companyId);
    if (query.buildingId) ref = ref.where('buildingId', '==', query.buildingId);
    if (query.apartmentId) ref = ref.where('apartmentId', '==', query.apartmentId);

    const snapshot = await ref.get();
    const limit = Math.min(5000, Math.max(1, query.limit ?? 200));
    const prefix = query.deliveryKeyPrefix?.trim();

    return snapshot.docs
      .map((doc): EmailDeliveryLogItem => {
        const data = doc.data();
        const createdAt = this.toDate(data.createdAt);
        return {
          id: doc.id,
          type: this.normalizeType(data.type),
          status: data.status === 'success' ? 'success' : 'error',
          to: typeof data.to === 'string' ? data.to : '',
          subject: typeof data.subject === 'string' ? data.subject : '',
          createdAt: createdAt ? createdAt.toISOString() : null,
          errorMessage: typeof data.errorMessage === 'string' ? data.errorMessage : undefined,
          deliveryKey: typeof data.deliveryKey === 'string' ? data.deliveryKey : undefined,
          companyId: typeof data.companyId === 'string' ? data.companyId : undefined,
          buildingId: typeof data.buildingId === 'string' ? data.buildingId : undefined,
          apartmentId: typeof data.apartmentId === 'string' ? data.apartmentId : undefined,
          metadata: data.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata)
            ? data.metadata as Record<string, unknown>
            : undefined,
        };
      })
      .filter((item) => !prefix || item.deliveryKey?.startsWith(prefix))
      .sort((a, b) => (new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()))
      .slice(0, limit);
  }

  private normalizeType(value: unknown): EmailLogType | 'unknown' {
    if (
      value === 'registrationCode' ||
      value === 'passwordReset' ||
      value === 'ownerInvitation' ||
      value === 'tenantInvitation' ||
      value === 'tenantInvitedByOwner' ||
      value === 'invoiceGenerated' ||
      value === 'meterReadingReminder' ||
      value === 'notification'
    ) {
      return value;
    }
    return 'unknown';
  }

  private toDate(value: unknown): Date | null {
    if (value instanceof Date) return value;
    if (value && typeof value === 'object' && typeof (value as { toDate?: () => Date }).toDate === 'function') {
      return (value as { toDate: () => Date }).toDate();
    }
    if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    return null;
  }
}
