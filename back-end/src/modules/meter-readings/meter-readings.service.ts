import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Request } from 'express';
import { FirebaseAdminService } from '../../common/infrastructure/firebase/firebase-admin.service';
import { RequestUser } from '../../common/auth/request-user.type';
import { isPropertyMemberRole, isStaffRole } from '../../common/auth/role.constants';
import { AuditLogService } from '../../common/services/audit-log.service';
import { RateLimitService } from '../../common/services/rate-limit.service';
import { buildMeterHistorySnapshot } from '../../common/utils/meter-reading-history';
import { normalizeEmail } from '../../common/utils/invitation-token';

@Injectable()
export class MeterReadingsService {
  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly rateLimitService: RateLimitService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private assertAuthenticated(user: RequestUser | undefined): asserts user is RequestUser {
    if (!user?.uid || !user.role) throw new UnauthorizedException('Authentication required');
    if (!isPropertyMemberRole(user.role) && !isStaffRole(user.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }

  private hasApartmentAccess(user: RequestUser, apartmentId: string, apartment: Record<string, unknown>): boolean {
    const normalizedUserEmail = normalizeEmail(user.email ?? '');
    const ownerEmail = typeof apartment.ownerEmail === 'string' ? normalizeEmail(apartment.ownerEmail) : '';

    const isOwner = Boolean(normalizedUserEmail && ownerEmail && normalizedUserEmail === ownerEmail);
    const isClaimApartment = Boolean(user.apartmentId && user.apartmentId === apartmentId);
    const isPrimaryResident = typeof apartment.residentId === 'string' && apartment.residentId === user.uid;
    const isTenantWithSubmit =
      Array.isArray(apartment.tenants) &&
      apartment.tenants.some((tenant) => {
        if (!tenant || typeof tenant !== 'object') return false;
        const t = tenant as Record<string, unknown>;
        const userId = typeof t.userId === 'string' ? t.userId : '';
        const permissions = Array.isArray(t.permissions)
          ? t.permissions.filter((p): p is string => typeof p === 'string')
          : [];
        return userId === user.uid && permissions.includes('submitMeter');
      });

    return isOwner || isClaimApartment || isPrimaryResident || isTenantWithSubmit;
  }

  private extractApartmentReadings(apartmentId: string, apartment: Record<string, unknown>) {
    const wr = (apartment.waterReadings ?? {}) as Record<string, unknown>;
    const entries: Record<string, unknown>[] = [];

    for (const key of ['coldmeterwater', 'hotmeterwater'] as const) {
      const group = wr[key] as Record<string, unknown> | undefined;
      if (!group || !Array.isArray(group.history)) continue;
      for (const item of group.history as Record<string, unknown>[]) {
        entries.push({ ...item, apartmentId: String(item.apartmentId ?? apartmentId), meterKey: key });
      }
    }

    return entries;
  }

  async list(user: RequestUser, apartmentId?: string, companyId?: string) {
    this.assertAuthenticated(user);
    const db = this.firebaseAdminService.firestore;

    if (apartmentId) {
      const snap = await db.collection('apartments').doc(apartmentId).get();
      if (!snap.exists) throw new NotFoundException('Apartment not found');

      const apartment = snap.data() as Record<string, unknown>;
      const companyIds = Array.isArray(apartment.companyIds)
        ? apartment.companyIds.filter((x): x is string => typeof x === 'string')
        : [];

      if (isPropertyMemberRole(user.role)) {
        if (!this.hasApartmentAccess(user, apartmentId, apartment)) {
          throw new ForbiddenException('Access denied for apartment');
        }
      } else if (user.companyId && !companyIds.includes(user.companyId)) {
        throw new ForbiddenException('Access denied for company');
      }

      return { items: this.extractApartmentReadings(apartmentId, apartment) };
    }

    if (isPropertyMemberRole(user.role)) {
      return { items: [] };
    }

    const effectiveCompanyId = companyId || user.companyId;
    if (!effectiveCompanyId) return { items: [] };
    if (user.companyId && user.companyId !== effectiveCompanyId) {
      throw new ForbiddenException('Access denied for company');
    }

    const snap = await db.collection('apartments').where('companyIds', 'array-contains', effectiveCompanyId).get();
    const items = snap.docs.flatMap((doc) => this.extractApartmentReadings(doc.id, doc.data() as Record<string, unknown>));

    return { items };
  }

  async create(request: Request, user: RequestUser, payload: Record<string, unknown>) {
    this.assertAuthenticated(user);

    const apartmentId = typeof payload.apartmentId === 'string' ? payload.apartmentId : '';
    const meterId = typeof payload.meterId === 'string' ? payload.meterId : '';
    if (!apartmentId || !meterId) {
      throw new BadRequestException('apartmentId and meterId are required');
    }

    const rl = await this.rateLimitService.consume(
      this.rateLimitService.buildKey(request, 'meter-readings:submit', apartmentId),
      20,
      60_000,
    );
    if (!rl.allowed) throw new BadRequestException('Too many requests');

    const db = this.firebaseAdminService.firestore;
    const apartmentRef = db.collection('apartments').doc(apartmentId);
    const apartmentSnap = await apartmentRef.get();
    if (!apartmentSnap.exists) throw new NotFoundException('Apartment not found');

    const apartment = apartmentSnap.data() as Record<string, unknown>;
    const companyIds = Array.isArray(apartment.companyIds)
      ? apartment.companyIds.filter((x): x is string => typeof x === 'string')
      : [];

    if (isPropertyMemberRole(user.role)) {
      if (!this.hasApartmentAccess(user, apartmentId, apartment)) {
        throw new ForbiddenException('Access denied for apartment');
      }
    } else if (user.companyId && !companyIds.includes(user.companyId)) {
      throw new ForbiddenException('Access denied for company');
    }

    const now = new Date();
    const month = typeof payload.month === 'number' ? payload.month : now.getMonth() + 1;
    const year = typeof payload.year === 'number' ? payload.year : now.getFullYear();

    const reading = {
      id: randomUUID(),
      apartmentId,
      meterId,
      submittedAt: now,
      previousValue: Number(payload.previousValue ?? 0),
      currentValue: Number(payload.currentValue ?? 0),
      consumption: Number(payload.consumption ?? 0),
      buildingId: typeof payload.buildingId === 'string' ? payload.buildingId : '',
      month,
      year,
    };

    const wr = (apartment.waterReadings ?? {}) as Record<string, unknown>;
    const namedKey = (['coldmeterwater', 'hotmeterwater'] as const).find(
      (k) => (wr[k] as Record<string, unknown> | undefined)?.meterId === meterId,
    );
    const preferredKey = payload.meterKey === 'coldmeterwater' || payload.meterKey === 'hotmeterwater'
      ? payload.meterKey
      : undefined;
    const key = namedKey ?? preferredKey ?? 'coldmeterwater';
    const meterGroup = (wr[key] as Record<string, unknown> | undefined) ?? { meterId, history: [] };
    const history = Array.isArray(meterGroup.history) ? [...(meterGroup.history as Record<string, unknown>[])] : [];

    const duplicate = history.some((h) => Number(h.month) === month && Number(h.year) === year);
    if (duplicate) {
      throw new ForbiddenException('Reading already exists for current month');
    }

    history.push(reading);
    const { history: recalculatedHistory, latestReading } = buildMeterHistorySnapshot(history as never[]);

    await apartmentRef.set(
      {
        waterReadings: {
          ...wr,
          [key]: {
            ...meterGroup,
            meterId,
            history: recalculatedHistory,
            currentValue: latestReading?.currentValue ?? null,
            previousValue: latestReading?.previousValue ?? null,
            submittedAt: latestReading?.submittedAt ?? null,
          },
        },
      },
      { merge: true },
    );

    void this.auditLogService.write({
      request,
      action: 'meter_reading.submit',
      status: 'success',
      actorUid: user.uid,
      actorRole: user.role,
      companyId: user.companyId,
      apartmentId,
      metadata: { meterId, month, year },
    });

    return { success: true, reading };
  }

  async update(
    request: Request,
    user: RequestUser,
    readingId: string,
    apartmentId: string,
    payload: Record<string, unknown>,
  ) {
    this.assertAuthenticated(user);
    if (!readingId || !apartmentId) {
      throw new BadRequestException('readingId and apartmentId are required');
    }

    const rl = await this.rateLimitService.consume(
      this.rateLimitService.buildKey(request, 'meter-reading:update', readingId),
      30,
      60_000,
    );
    if (!rl.allowed) throw new BadRequestException('Too many requests');

    const db = this.firebaseAdminService.firestore;
    const apartmentRef = db.collection('apartments').doc(apartmentId);
    const apartmentSnap = await apartmentRef.get();
    if (!apartmentSnap.exists) throw new NotFoundException('Apartment not found');

    const apartment = apartmentSnap.data() as Record<string, unknown>;
    const companyIds = Array.isArray(apartment.companyIds)
      ? apartment.companyIds.filter((x): x is string => typeof x === 'string')
      : [];

    if (isPropertyMemberRole(user.role)) {
      if (!this.hasApartmentAccess(user, apartmentId, apartment)) {
        throw new ForbiddenException('Access denied for apartment');
      }
    } else if (user.companyId && !companyIds.includes(user.companyId)) {
      throw new ForbiddenException('Access denied for company');
    }

    const wr = (apartment.waterReadings ?? {}) as Record<string, unknown>;
    let foundKey: 'coldmeterwater' | 'hotmeterwater' | null = null;
    let foundGroup: Record<string, unknown> | null = null;
    let foundIndex = -1;
    for (const key of ['coldmeterwater', 'hotmeterwater'] as const) {
      const group = wr[key] as Record<string, unknown> | undefined;
      if (!group || !Array.isArray(group.history)) continue;
      const idx = (group.history as Record<string, unknown>[]).findIndex((h) => String(h.id ?? '') === readingId);
      if (idx >= 0) {
        foundKey = key;
        foundGroup = group;
        foundIndex = idx;
        break;
      }
    }
    if (!foundKey || !foundGroup || foundIndex < 0) throw new NotFoundException('Reading not found');

    const history = [...(foundGroup.history as Record<string, unknown>[])];
    history[foundIndex] = { ...history[foundIndex], ...payload, id: history[foundIndex].id };
    const { history: recalculatedHistory, latestReading } = buildMeterHistorySnapshot(history as never[]);

    await apartmentRef.set(
      {
        waterReadings: {
          ...wr,
          [foundKey]: {
            ...foundGroup,
            history: recalculatedHistory,
            currentValue: latestReading?.currentValue ?? null,
            previousValue: latestReading?.previousValue ?? null,
            submittedAt: latestReading?.submittedAt ?? null,
          },
        },
      },
      { merge: true },
    );

    return { success: true };
  }

  async remove(request: Request, user: RequestUser, readingId: string, apartmentId: string) {
    this.assertAuthenticated(user);
    if (!readingId || !apartmentId) {
      throw new BadRequestException('readingId and apartmentId are required');
    }

    const rl = await this.rateLimitService.consume(
      this.rateLimitService.buildKey(request, 'meter-reading:delete', readingId),
      20,
      60_000,
    );
    if (!rl.allowed) throw new BadRequestException('Too many requests');

    const db = this.firebaseAdminService.firestore;
    const apartmentRef = db.collection('apartments').doc(apartmentId);
    const apartmentSnap = await apartmentRef.get();
    if (!apartmentSnap.exists) throw new NotFoundException('Apartment not found');

    const apartment = apartmentSnap.data() as Record<string, unknown>;
    const companyIds = Array.isArray(apartment.companyIds)
      ? apartment.companyIds.filter((x): x is string => typeof x === 'string')
      : [];

    if (isPropertyMemberRole(user.role)) {
      if (!this.hasApartmentAccess(user, apartmentId, apartment)) {
        throw new ForbiddenException('Access denied for apartment');
      }
    } else if (user.companyId && !companyIds.includes(user.companyId)) {
      throw new ForbiddenException('Access denied for company');
    }

    const wr = (apartment.waterReadings ?? {}) as Record<string, unknown>;
    let foundKey: 'coldmeterwater' | 'hotmeterwater' | null = null;
    let foundGroup: Record<string, unknown> | null = null;
    let foundEntry: Record<string, unknown> | null = null;
    for (const key of ['coldmeterwater', 'hotmeterwater'] as const) {
      const group = wr[key] as Record<string, unknown> | undefined;
      if (!group || !Array.isArray(group.history)) continue;
      const entry = (group.history as Record<string, unknown>[]).find((h) => String(h.id ?? '') === readingId);
      if (entry) {
        foundKey = key;
        foundGroup = group;
        foundEntry = entry;
        break;
      }
    }
    if (!foundKey || !foundGroup || !foundEntry) throw new NotFoundException('Reading not found');

    const submittedAtRaw = foundEntry.submittedAt as { toDate?: () => Date } | Date | string | undefined;
    const submittedAt =
      submittedAtRaw instanceof Date
        ? submittedAtRaw
        : typeof submittedAtRaw === 'string'
          ? new Date(submittedAtRaw)
          : typeof submittedAtRaw?.toDate === 'function'
            ? submittedAtRaw.toDate()
            : null;
    const now = new Date();
    if (
      !submittedAt ||
      Number.isNaN(submittedAt.getTime()) ||
      submittedAt.getFullYear() !== now.getFullYear() ||
      submittedAt.getMonth() !== now.getMonth()
    ) {
      throw new ForbiddenException('Cannot delete readings from previous months');
    }

    const history = (foundGroup.history as Record<string, unknown>[]).filter((h) => String(h.id ?? '') !== readingId);
    const { history: recalculatedHistory, latestReading } = buildMeterHistorySnapshot(history as never[]);

    await apartmentRef.set(
      {
        waterReadings: {
          ...wr,
          [foundKey]: {
            ...foundGroup,
            history: recalculatedHistory,
            currentValue: latestReading?.currentValue ?? null,
            previousValue: latestReading?.previousValue ?? null,
            submittedAt: latestReading?.submittedAt ?? null,
          },
        },
      },
      { merge: true },
    );

    return { success: true };
  }
}
