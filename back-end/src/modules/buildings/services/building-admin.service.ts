import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { isPlatformAdminRole } from '../../../common/auth/role.constants';
import { RequestUser } from '../../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { RateLimitService } from '../../../common/services/rate-limit.service';
import { BuildingStatsService } from './building-stats.service';

@Injectable()
export class BuildingAdminService {
  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly rateLimitService: RateLimitService,
    private readonly buildingStatsService: BuildingStatsService,
  ) {}

  async listAllForAdmin(request: Request, user: RequestUser) {
    this.assertPlatformAdmin(user);
    await this.enforceRateLimit(request, 'buildings:admin-list-all', user.uid, 50);

    const db = this.firebaseAdminService.firestore;
    const [buildingsSnap, companiesSnap, occupancyStats] = await Promise.all([
      db.collection('buildings').get(),
      db.collection('companies').get(),
      this.buildingStatsService.getAllBuildingOccupancyStats(),
    ]);

    const companies = new Map<string, Record<string, unknown>>();
    for (const doc of companiesSnap.docs) {
      companies.set(doc.id, doc.data() as Record<string, unknown>);
    }

    const items = buildingsSnap.docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const managedBy = data.managedBy && typeof data.managedBy === 'object'
        ? (data.managedBy as Record<string, unknown>)
        : {};
      const companyId = this.firstString(data.companyId, managedBy.companyId);
      const company = companyId ? companies.get(companyId) : undefined;
      const companyName = this.firstString(
        data.companyName,
        managedBy.companyName,
        company?.companyName,
        company?.name,
        companyId,
      );
      const companyEmail = this.firstString(
        data.companyEmail,
        data.contactEmail,
        managedBy.companyEmail,
        managedBy.contactEmail,
        managedBy.email,
        company?.companyEmail,
        company?.contactEmail,
        company?.email,
      );
      const companyPhone = this.firstString(
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
      const managerName = this.firstString(
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
    const [buildingsSnap, legacySnap] = await Promise.all([
      db.collection('buildings').get(),
      db.collection('platform_billing_invoices').get(),
    ]);

    const buildingInvoiceSnaps = await Promise.all(
      buildingsSnap.docs.map((buildingDoc) =>
        buildingDoc.ref.collection('platform_billing_invoices').get(),
      ),
    );

    const itemsByPath = new Map<string, Record<string, unknown>>();
    for (const doc of [...buildingInvoiceSnaps.flatMap((snap) => snap.docs), ...legacySnap.docs]) {
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
    if (!rl.allowed) throw new BadRequestException('Too many requests');
  }

  private firstString(...values: unknown[]) {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return '';
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
