import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import { isPlatformAdminRole } from '../../../common/auth/role.constants';
import { RequestUser } from '../../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { RateLimitService } from '../../../common/services/rate-limit.service';
import { BuildingStatsService } from './building-stats.service';
import { TooManyRequestsException } from '../../../common/errors/too-many-requests.exception';
import { firstNonEmptyString } from '../../../common/utils/values';

@Injectable()
export class BuildingAdminService {
  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly rateLimitService: RateLimitService,
    private readonly buildingStatsService: BuildingStatsService,
  ) {}

  /**
   * Bounded, resumable migration: copies `managedBy.companyId` into `companyId` and marks
   * buildings with `scopeVersion: 2`. Conflicting buildings (both set, different) are reported and
   * left untouched. `remaining` = buildings not yet marked; when it is 0 together with the
   * apartments migration, LEGACY_SCOPE_QUERIES=false can be set.
   */
  async migrateCanonicalScope(params: {
    request: Request;
    user: RequestUser;
    cursor?: string;
    limit?: number;
    apply: boolean;
  }) {
    this.assertPlatformAdmin(params.user);
    await this.enforceRateLimit(params.request, 'buildings:migrate-canonical-scope', params.user.uid, 5);

    const db = this.firebaseAdminService.firestore;
    const limit = Number.isFinite(params.limit) ? Math.min(300, Math.max(1, Math.floor(params.limit!))) : 100;
    const cursorId = this.decodeMigrationCursor(params.cursor);
    let query = db.collection('buildings').orderBy(FieldPath.documentId()).limit(limit + 1);
    if (cursorId) query = query.startAfter(cursorId);

    const snapshot = await query.get();
    const page = snapshot.docs.slice(0, limit);
    const hasMore = snapshot.docs.length > limit;
    const batch = params.apply ? db.batch() : null;
    const skipped: Array<{ buildingId: string; reason: string }> = [];
    let eligible = 0;
    let alreadyCanonical = 0;

    for (const doc of page) {
      const data = doc.data() as Record<string, unknown>;
      const managedBy = data.managedBy && typeof data.managedBy === 'object' ? data.managedBy as Record<string, unknown> : {};
      const directCompanyId = firstNonEmptyString(data.companyId);
      const managedCompanyId = firstNonEmptyString(managedBy.companyId);

      if (directCompanyId && managedCompanyId && directCompanyId !== managedCompanyId) {
        skipped.push({ buildingId: doc.id, reason: `companyId (${directCompanyId}) differs from managedBy.companyId (${managedCompanyId})` });
        continue;
      }
      const companyId = directCompanyId || managedCompanyId;
      if (!companyId) {
        skipped.push({ buildingId: doc.id, reason: 'companyId cannot be resolved' });
        continue;
      }

      const patch: Record<string, unknown> = {};
      if (!directCompanyId) patch.companyId = companyId;
      if (data.scopeVersion !== 2) patch.scopeVersion = 2;
      if (Object.keys(patch).length === 0) {
        alreadyCanonical += 1;
        continue;
      }

      eligible += 1;
      batch?.set(doc.ref, { ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }

    if (batch && eligible > 0) await batch.commit();

    const [total, canonical] = await Promise.all([
      db.collection('buildings').count().get(),
      db.collection('buildings').where('scopeVersion', '==', 2).count().get(),
    ]);
    const lastDocId = page.at(-1)?.id;
    return {
      mode: params.apply ? 'applied' : 'dry-run',
      scanned: page.length,
      eligible,
      updated: params.apply ? eligible : 0,
      alreadyCanonical,
      skipped,
      remaining: Math.max(0, total.data().count - canonical.data().count),
      hasMore,
      nextCursor: hasMore && lastDocId ? Buffer.from(lastDocId, 'utf8').toString('base64url') : undefined,
    };
  }

  private decodeMigrationCursor(cursor?: string): string | undefined {
    if (!cursor || cursor.length > 512) return undefined;
    try {
      const id = Buffer.from(cursor, 'base64url').toString('utf8').trim();
      return /^[A-Za-z0-9_-]{1,256}$/.test(id) ? id : undefined;
    } catch {
      return undefined;
    }
  }

  async listAllForAdmin(request: Request, user: RequestUser) {
    this.assertPlatformAdmin(user);
    await this.enforceRateLimit(request, 'buildings:admin-list-all', user.uid, 50);

    const db = this.firebaseAdminService.firestore;
    const [buildingsSnap, companiesSnap] = await Promise.all([
      db.collection('buildings').get(),
      db.collection('companies').get(),
    ]);
    // Cached per-building stats (was: a scan of every apartment on the platform per request).
    const occupancyStats = await this.buildingStatsService.getStatsForBuildings(buildingsSnap.docs.map((doc) => doc.id));

    const companies = new Map<string, Record<string, unknown>>();
    for (const doc of companiesSnap.docs) {
      companies.set(doc.id, doc.data() as Record<string, unknown>);
    }

    const items = buildingsSnap.docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const managedBy = data.managedBy && typeof data.managedBy === 'object'
        ? (data.managedBy as Record<string, unknown>)
        : {};
      const companyId = firstNonEmptyString(data.companyId, managedBy.companyId);
      const company = companyId ? companies.get(companyId) : undefined;
      const companyName = firstNonEmptyString(
        data.companyName,
        managedBy.companyName,
        company?.companyName,
        company?.name,
        companyId,
      );
      const companyEmail = firstNonEmptyString(
        data.companyEmail,
        data.contactEmail,
        managedBy.companyEmail,
        managedBy.contactEmail,
        managedBy.email,
        company?.companyEmail,
        company?.contactEmail,
        company?.email,
      );
      const companyPhone = firstNonEmptyString(
        data.companyPhone,
        data.contactPhone,
        data.phone,
        managedBy.companyPhone,
        managedBy.contactPhone,
        managedBy.phone,
        company?.companyPhone,
        company?.contactPhone,
        company?.phone,
      );
      const managerName = firstNonEmptyString(
        data.managerName,
        data.contactName,
        managedBy.managerName,
        managedBy.contactName,
        managedBy.name,
        company?.managerName,
        company?.contactName,
      );

      return this.buildingStatsService.applyOccupancyStats(
        doc.id,
        {
          ...data,
          companyId,
          companyName,
          companyEmail,
          companyPhone,
          managerName,
          editLocked: data.editLocked === true,
        },
        occupancyStats.get(doc.id),
      );
    });

    return { items };
  }

  async listPlatformBillingInvoices(request: Request, user: RequestUser) {
    this.assertPlatformAdmin(user);
    await this.enforceRateLimit(request, 'buildings:admin-billing-invoices', user.uid, 50);

    const db = this.firebaseAdminService.firestore;
    // One collection-group query covers buildings/*/platform_billing_invoices AND the legacy
    // top-level platform_billing_invoices collection (was: one query per building on the platform).
    const group = db.collectionGroup('platform_billing_invoices');
    let docs: FirebaseFirestore.QueryDocumentSnapshot[];
    try {
      docs = (await group.orderBy('createdAt', 'desc').limit(500).get()).docs;
    } catch (error) {
      const code = (error as { code?: unknown } | undefined)?.code;
      if (code !== 9 && !/requires an index|FAILED_PRECONDITION/i.test(String((error as Error)?.message))) throw error;
      docs = (await group.get()).docs; // index not deployed yet: still a single query
    }

    const itemsByPath = new Map<string, Record<string, unknown>>();
    for (const doc of docs) {
      itemsByPath.set(doc.ref.path, {
        ...(doc.data() as Record<string, unknown>),
        id: doc.id,
      });
    }

    return {
      items: Array.from(itemsByPath.values())
        .sort((left, right) => {
          const leftTime = this.dateSortValue(left.createdAt);
          const rightTime = this.dateSortValue(right.createdAt);
          return rightTime - leftTime;
        })
        .slice(0, 500),
    };
  }

  async setEditLock(request: Request, user: RequestUser, buildingId: string, payload: Record<string, unknown>) {
    this.assertPlatformAdmin(user);
    if (!buildingId?.trim()) throw new BadRequestException('buildingId is required');

    await this.enforceRateLimit(request, 'buildings:admin-edit-lock', `${user.uid}:${buildingId}`, 40);

    const locked = payload.locked ?? payload.editLocked;
    if (typeof locked !== 'boolean') {
      throw new BadRequestException('locked must be boolean');
    }

    const db = this.firebaseAdminService.firestore;
    const ref = db.collection('buildings').doc(buildingId);
    const snap = await ref.get();
    if (!snap.exists) throw new NotFoundException('Building not found');

    const updatedAt = new Date();
    await ref.set(
      {
        editLocked: locked,
        editLockedAt: locked ? updatedAt : FieldValue.delete(),
        editLockedBy: locked ? user.uid : FieldValue.delete(),
        updatedAt,
      },
      { merge: true },
    );

    return { success: true, buildingId, editLocked: locked };
  }

  private assertPlatformAdmin(user: RequestUser | undefined): asserts user is RequestUser {
    if (!user?.uid) throw new UnauthorizedException('Authentication required');
    if (!isPlatformAdminRole(user.role)) {
      throw new ForbiddenException('Only platform administrators can perform this action');
    }
  }

  private async enforceRateLimit(
    request: Request,
    scope: string,
    discriminator: string,
    limit: number,
  ): Promise<void> {
    const rl = await this.rateLimitService.consume(
      this.rateLimitService.buildKey(request, scope, discriminator),
      limit,
      60_000,
    );
    if (!rl.allowed) throw new TooManyRequestsException(rl.resetAt);
  }

  private dateSortValue(value: unknown) {
    if (value instanceof Date) {
      return value.getTime();
    }

    if (value && typeof value === 'object') {
      const timestamp = value as { toDate?: unknown; seconds?: unknown; _seconds?: unknown };
      if (typeof timestamp.toDate === 'function') {
        return (timestamp.toDate as () => Date)().getTime();
      }

      const seconds = typeof timestamp.seconds === 'number' ? timestamp.seconds : timestamp._seconds;
      if (typeof seconds === 'number') {
        return seconds * 1000;
      }
    }

    if (typeof value === 'string' || typeof value === 'number') {
      const time = new Date(value).getTime();
      return Number.isFinite(time) ? time : 0;
    }

    return 0;
  }
}
