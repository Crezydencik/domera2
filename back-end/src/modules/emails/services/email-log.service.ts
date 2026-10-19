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

export const EMAIL_LOG_TYPES = [
  'registrationCode',
  'passwordReset',
  'ownerInvitation',
  'tenantInvitation',
  'tenantInvitedByOwner',
  'invoiceGenerated',
  'meterReadingReminder',
  'notification',
] as const satisfies readonly EmailLogType[];

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

    try {
      return await this.getStatsViaAggregation(ref, query.type);
    } catch (error) {
      if (!this.isMissingIndexError(error)) throw error;
      this.logger.warn(`email.log.stats.index_missing fallback=full_read reason=${error instanceof Error ? error.message : String(error)}`);
      return this.getStatsFromDocuments(ref);
    }
  }

  /**
   * count() aggregations (billed per 1000 index entries) instead of downloading every log entry.
   * "error" = total - success, matching the document-based variant (anything not 'success').
   */
  private async getStatsViaAggregation(ref: FirebaseFirestore.Query, fixedType?: EmailLogType) {
    const last30DaysStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const count = async (query: FirebaseFirestore.Query) => (await query.count().get()).data().count;
    const types: Array<EmailLogType> = fixedType ? [fixedType] : [...EMAIL_LOG_TYPES];

    const [total, success, last30Total, last30Success, lastSnap, perType] = await Promise.all([
      count(ref),
      count(ref.where('status', '==', 'success')),
      count(ref.where('createdAt', '>=', last30DaysStart)),
      count(ref.where('status', '==', 'success').where('createdAt', '>=', last30DaysStart)),
      ref.orderBy('createdAt', 'desc').limit(1).get(),
      Promise.all(types.map(async (type) => {
        const typed = fixedType ? ref : ref.where('type', '==', type);
        const [typeTotal, typeSuccess] = await Promise.all([count(typed), count(typed.where('status', '==', 'success'))]);
        return { type, total: typeTotal, success: typeSuccess };
      })),
    ]);

    const byType: Record<string, { total: number; success: number; error: number }> = {};
    let knownTotal = 0;
    let knownSuccess = 0;
    for (const item of perType) {
      if (item.total === 0) continue;
      byType[item.type] = { total: item.total, success: item.success, error: item.total - item.success };
      knownTotal += item.total;
      knownSuccess += item.success;
    }
    if (!fixedType && total > knownTotal) {
      // Entries with a missing/unknown type, as the document-based variant reports them.
      byType.unknown = { total: total - knownTotal, success: success - knownSuccess, error: total - knownTotal - (success - knownSuccess) };
    }

    const lastCreatedAt = lastSnap.docs[0] ? this.toDate(lastSnap.docs[0].data().createdAt) : null;
    return {
      total,
      success,
      error: total - success,
      last30Days: { total: last30Total, success: last30Success, error: last30Total - last30Success },
      byType,
      lastSentAt: lastCreatedAt ? lastCreatedAt.toISOString() : null,
    };
  }

  private async getStatsFromDocuments(ref: FirebaseFirestore.Query) {
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

  /**
   * Batched variant of hasSuccessfulDeliveryKey: returns the subset of keys that already have a
   * successful delivery. Uses `in` queries (30 keys each) instead of one query per key.
   */
  async successfulDeliveryKeys(deliveryKeys: string[]): Promise<Set<string>> {
    const keys = Array.from(new Set(deliveryKeys.map((key) => key.trim()).filter(Boolean)));
    const found = new Set<string>();
    const chunks: string[][] = [];
    for (let index = 0; index < keys.length; index += 30) chunks.push(keys.slice(index, index + 30));

    const collection = this.firebaseAdminService.firestore.collection('email_logs');
    const CONCURRENCY = 5;
    for (let index = 0; index < chunks.length; index += CONCURRENCY) {
      const snapshots = await Promise.all(
        chunks.slice(index, index + CONCURRENCY).map((chunk) => collection.where('deliveryKey', 'in', chunk).get()),
      );
      for (const snapshot of snapshots) {
        for (const doc of snapshot.docs) {
          const data = doc.data();
          if (data.status === 'success' && typeof data.deliveryKey === 'string') found.add(data.deliveryKey);
        }
      }
    }

    return found;
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

    const limit = Math.min(5000, Math.max(1, query.limit ?? 200));
    const prefix = query.deliveryKeyPrefix?.trim();
    // Prefix and page size are pushed into the query instead of reading the whole log and
    // filtering in JS. Falls back to the old full read while the composite index is missing.
    const narrowed = prefix
      ? ref.where('deliveryKey', '>=', prefix).where('deliveryKey', '<', `${prefix}\uf8ff`).limit(5000)
      : ref.orderBy('createdAt', 'desc').limit(limit);
    let snapshot: FirebaseFirestore.QuerySnapshot;
    try {
      snapshot = await narrowed.get();
    } catch (error) {
      if (!this.isMissingIndexError(error)) throw error;
      this.logger.warn(`email.log.deliveries.index_missing fallback=full_read reason=${error instanceof Error ? error.message : String(error)}`);
      snapshot = await ref.get();
    }

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

  private isMissingIndexError(error: unknown): boolean {
    const code = (error as { code?: unknown } | undefined)?.code;
    return code === 9 || code === 'failed-precondition'
      || /requires an index|FAILED_PRECONDITION/i.test(error instanceof Error ? error.message : String(error));
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
