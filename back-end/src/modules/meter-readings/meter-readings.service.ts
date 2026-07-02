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
import { EmailService } from '../emails/email.service';

@Injectable()
export class MeterReadingsService {
  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly rateLimitService: RateLimitService,
    private readonly auditLogService: AuditLogService,
    private readonly emailService: EmailService,
  ) {}

  private assertAuthenticated(user: RequestUser | undefined): asserts user is RequestUser {
    if (!user?.uid || !user.role) throw new UnauthorizedException('Authentication required');
    if (!isPropertyMemberRole(user.role) && !isStaffRole(user.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }

  private requireStaffCompanyId(user: RequestUser): string {
    if (user.companyId) return user.companyId;
    if (user.role === 'ManagementCompany') return user.uid;
    throw new ForbiddenException('Company scope is required');
  }

  private assertStaffApartmentCompanyAccess(user: RequestUser, apartment: Record<string, unknown>): void {
    const staffCompanyId = this.requireStaffCompanyId(user);
    const companyIds = Array.isArray(apartment.companyIds)
      ? apartment.companyIds.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      : [];
    const companyId = typeof apartment.companyId === 'string' ? apartment.companyId : '';

    if (!companyIds.includes(staffCompanyId) && companyId !== staffCompanyId) {
      throw new ForbiddenException('Access denied for company');
    }
  }

  private hasApartmentAccess(user: RequestUser, apartmentId: string, apartment: Record<string, unknown>): boolean {
    const normalizedUserEmail = normalizeEmail(user.email ?? '');
    const ownerEmail = typeof apartment.ownerEmail === 'string' ? normalizeEmail(apartment.ownerEmail) : '';

    const isOwner = Boolean(
      normalizedUserEmail &&
      ownerEmail &&
      normalizedUserEmail === ownerEmail &&
      apartment.ownerActivated === true,
    );
    const isPrimaryResident = typeof apartment.residentId === 'string' && apartment.residentId === user.uid;
    
    // Helper function to check if tenant is within lease dates
    const isTenantActive = (tenant: Record<string, unknown>): boolean => {
      const fromDate = typeof tenant.fromDate === 'string' ? new Date(tenant.fromDate) : null;
      const until = typeof tenant.until === 'string' ? new Date(tenant.until) : null;
      const now = new Date();
      
      // Check start date
      if (fromDate && now < fromDate) {
        return false; // Lease hasn't started yet
      }
      
      // Check end date
      if (until && now > until) {
        return false; // Lease has ended
      }
      
      return true; // Within lease period
    };
    
    const isTenantWithSubmit =
      Array.isArray(apartment.tenants) &&
      apartment.tenants.some((tenant) => {
        if (!tenant || typeof tenant !== 'object') return false;
        const t = tenant as Record<string, unknown>;
        const userId = typeof t.userId === 'string' ? t.userId : '';
        const permissions = Array.isArray(t.permissions)
          ? t.permissions.filter((p): p is string => typeof p === 'string')
          : [];
        return userId === user.uid && permissions.includes('submitMeter') && isTenantActive(t);
      });

    return isOwner || isPrimaryResident || isTenantWithSubmit;
  }

  private extractApartmentReadings(
    apartmentId: string,
    apartment: Record<string, unknown>,
    buildingInfo?: { name?: string; address?: string },
    user?: RequestUser,
  ) {
    const wr = (apartment.waterReadings ?? {}) as Record<string, unknown>;
    const entries: Record<string, unknown>[] = [];
    const pickNumber = (...vals: unknown[]): string => {
      for (const v of vals) {
        if (typeof v === 'string' && v.trim() !== '') return v.trim();
        if (typeof v === 'number' && Number.isFinite(v)) return String(v);
      }
      return '';
    };
    const apartmentNumber = pickNumber(
      apartment.number,
      apartment.apartmentNumber,
      apartment.apartmentNo,
      apartment.no,
      apartment.flatNumber,
      apartment.readableId,
    );
    const buildingId = typeof apartment.buildingId === 'string' ? apartment.buildingId : '';
    const buildingName = buildingInfo?.name ?? '';
    const buildingAddress = buildingInfo?.address ?? (typeof apartment.address === 'string' ? apartment.address : '');

    for (const key of ['coldmeterwater', 'hotmeterwater'] as const) {
      const group = wr[key] as Record<string, unknown> | undefined;
      if (!group || !Array.isArray(group.history)) continue;
      const serialNumber = typeof group.serialNumber === 'string' ? group.serialNumber : '';
      let tenantFromDate: Date | null = null;
      let tenantUntilDate: Date | null = null;
      if (user) {
        const tenants = Array.isArray(apartment.tenants) ? apartment.tenants : [];
        const currentTenant = tenants.find((tenant) => {
          if (!tenant || typeof tenant !== 'object') return false;
          const t = tenant as Record<string, unknown>;
          return typeof t.userId === 'string' && t.userId === user.uid;
        });
        if (currentTenant) {
          const t = currentTenant as Record<string, unknown>;
          if (typeof t.fromDate === 'string') tenantFromDate = new Date(t.fromDate);
          if (typeof t.until === 'string') tenantUntilDate = new Date(t.until);
        }
      }

      for (const item of group.history as Record<string, unknown>[]) {
        // Нормализуем submittedAt в ISO 8601 формат
        let submittedAt: string | undefined;
        let submittedAtDate: Date | null = null;
        if (item.submittedAt) {
          if (item.submittedAt instanceof Date) {
            submittedAtDate = item.submittedAt;
            submittedAt = item.submittedAt.toISOString();
          } else if (typeof item.submittedAt === 'string') {
            // Если уже строка, пробуем парсить как дату и обратно в ISO
            const parsed = new Date(item.submittedAt);
            if (!Number.isNaN(parsed.getTime())) {
              submittedAtDate = parsed;
              submittedAt = parsed.toISOString();
            } else {
              submittedAt = item.submittedAt;
            }
          } else if (item.submittedAt && typeof item.submittedAt === 'object') {
            // Firestore Timestamp: { _seconds: 1234567890, _nanoseconds: 0 }
            const ts = item.submittedAt as Record<string, unknown>;
            if (typeof ts._seconds === 'number') {
              const ms = ts._seconds * 1000 + ((typeof ts._nanoseconds === 'number' ? ts._nanoseconds : 0) / 1000000);
              submittedAtDate = new Date(ms);
              submittedAt = submittedAtDate.toISOString();
            }
          }
        }

        const historyVisible = !user || !submittedAtDate
          ? true
          : !((tenantFromDate && submittedAtDate < tenantFromDate) || (tenantUntilDate && submittedAtDate > tenantUntilDate));
        
        entries.push({ 
          ...item, 
          historyVisible,
          apartmentId: String(item.apartmentId ?? apartmentId), 
          apartmentNumber,
          buildingId,
          buildingName,
          buildingAddress,
          meterKey: key,
          serialNumber,
          submittedAt,
        });
      }
    }

    return entries;
  }

  private async getAccessibleApartmentIds(user: RequestUser): Promise<string[]> {
    const db = this.firebaseAdminService.firestore;
    const apartmentIds = new Set<string>();

    const addApartmentId = (value: unknown) => {
      if (typeof value === 'string' && value.trim()) {
        apartmentIds.add(value.trim());
      }
    };

    addApartmentId(user.apartmentId);

    const userSnap = await db.collection('users').doc(user.uid).get();
    const userData = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : {};

    addApartmentId(userData.apartmentId);

    if (Array.isArray(userData.apartmentIds)) {
      userData.apartmentIds.forEach(addApartmentId);
    }

    const normalizedEmail = normalizeEmail(
      (typeof user.email === 'string' ? user.email : typeof userData.email === 'string' ? userData.email : '') ?? '',
    );

    const [residentSnap, ownerIdSnap, ownerEmailSnap] = await Promise.all([
      db.collection('apartments').where('residentId', '==', user.uid).get(),
      db.collection('apartments').where('ownerId', '==', user.uid).get(),
      normalizedEmail
        ? db.collection('apartments').where('ownerEmail', '==', normalizedEmail).get()
        : Promise.resolve(null),
    ]);

    for (const doc of residentSnap.docs) {
      apartmentIds.add(doc.id);
    }

    for (const snap of [ownerIdSnap, ownerEmailSnap]) {
      if (!snap) continue;

      for (const doc of snap.docs) {
        apartmentIds.add(doc.id);
      }
    }

    const candidateIds = Array.from(apartmentIds);
    if (!candidateIds.length) return [];

    const snaps = await db.getAll(...candidateIds.map((id) => db.collection('apartments').doc(id)));

    return snaps
      .filter((snap) => snap.exists)
      .filter((snap) => this.hasApartmentAccess(user, snap.id, snap.data() as Record<string, unknown>))
      .map((snap) => snap.id);
  }

  async list(user: RequestUser, apartmentId?: string, companyId?: string) {
    this.assertAuthenticated(user);
    const db = this.firebaseAdminService.firestore;

    if (apartmentId) {
      const snap = await db.collection('apartments').doc(apartmentId).get();
      if (!snap.exists) throw new NotFoundException('Apartment not found');

      const apartment = snap.data() as Record<string, unknown>;
      if (isPropertyMemberRole(user.role)) {
        if (!this.hasApartmentAccess(user, apartmentId, apartment)) {
          throw new ForbiddenException('Access denied for apartment');
        }
      } else if (isStaffRole(user.role)) {
        this.assertStaffApartmentCompanyAccess(user, apartment);
      }

      return { items: this.extractApartmentReadings(apartmentId, apartment, await this.loadBuildingInfo(apartment), user) };
    }

    if (isPropertyMemberRole(user.role)) {
      const accessibleApartmentIds = await this.getAccessibleApartmentIds(user);
      if (!accessibleApartmentIds.length) {
        return { items: [] };
      }

      const apartmentSnaps = await db.getAll(...accessibleApartmentIds.map((id) => db.collection('apartments').doc(id)));
      const buildingIds = Array.from(
        new Set(
          apartmentSnaps
            .map((snap) => (snap.exists ? (snap.data() as Record<string, unknown>).buildingId : undefined))
            .filter((id): id is string => typeof id === 'string' && id.trim().length > 0),
        ),
      );
      const buildingMap = await this.loadBuildings(buildingIds);
      const items = apartmentSnaps.flatMap((snap) => {
        if (!snap.exists) return [];
        const apartment = snap.data() as Record<string, unknown>;
        const buildingId = typeof apartment.buildingId === 'string' ? apartment.buildingId : '';
        return this.extractApartmentReadings(snap.id, apartment, buildingMap.get(buildingId), user);
      });

      return { items };
    }

    const staffCompanyId = this.requireStaffCompanyId(user);
    const effectiveCompanyId = companyId || staffCompanyId;
    if (effectiveCompanyId !== staffCompanyId) {
      throw new ForbiddenException('Access denied for company');
    }

    const snap = await db.collection('apartments').where('companyIds', 'array-contains', effectiveCompanyId).get();
    const buildingIds = Array.from(
      new Set(
        snap.docs
          .map((doc) => (doc.data() as Record<string, unknown>).buildingId)
          .filter((b): b is string => typeof b === 'string' && b !== ''),
      ),
    );
    const buildingMap = await this.loadBuildings(buildingIds);
    const items = snap.docs.flatMap((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const bId = typeof data.buildingId === 'string' ? data.buildingId : '';
      return this.extractApartmentReadings(doc.id, data, buildingMap.get(bId), isPropertyMemberRole(user.role) ? user : undefined);
    });

    return { items };
  }

  private async loadBuildingInfo(apartment: Record<string, unknown>): Promise<{ name?: string; address?: string } | undefined> {
    const buildingId = typeof apartment.buildingId === 'string' ? apartment.buildingId : '';
    if (!buildingId) return undefined;
    const map = await this.loadBuildings([buildingId]);
    return map.get(buildingId);
  }

  private async loadBuildings(buildingIds: string[]): Promise<Map<string, { name?: string; address?: string }>> {
    const map = new Map<string, { name?: string; address?: string }>();
    if (buildingIds.length === 0) return map;
    const db = this.firebaseAdminService.firestore;
    const snaps = await Promise.all(buildingIds.map((id) => db.collection('buildings').doc(id).get()));
    for (const s of snaps) {
      if (!s.exists) continue;
      const d = s.data() as Record<string, unknown>;
      map.set(s.id, {
        name: typeof d.name === 'string' ? d.name : typeof d.title === 'string' ? d.title : undefined,
        address:
          typeof d.address === 'string'
            ? d.address
            : typeof d.street === 'string'
              ? d.street
              : typeof d.location === 'string'
                ? d.location
                : undefined,
      });
    }
    return map;
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
    if (isPropertyMemberRole(user.role)) {
      if (!this.hasApartmentAccess(user, apartmentId, apartment)) {
        throw new ForbiddenException('Access denied for apartment');
      }
    } else if (isStaffRole(user.role)) {
      this.assertStaffApartmentCompanyAccess(user, apartment);
    }

    const now = new Date();
    const month = typeof payload.month === 'number' ? payload.month : now.getMonth() + 1;
    const year = typeof payload.year === 'number' ? payload.year : now.getFullYear();

    // If the submission targets a past/future month, anchor submittedAt to that month
    // (last day at 12:00) so history listings show the correct period.
    const submittedAt =
      month !== now.getMonth() + 1 || year !== now.getFullYear()
        ? new Date(year, month, 0, 12, 0, 0)
        : now;

    const previousValue = Number(payload.previousValue ?? 0);
    const currentValue = Number(payload.currentValue ?? 0);
    const consumption = Number.isFinite(currentValue) && Number.isFinite(previousValue)
      ? Number(Math.max(0, currentValue - previousValue).toFixed(3))
      : 0;

    const reading = {
      id: randomUUID(),
      apartmentId,
      meterId,
      submittedAt,
      previousValue,
      currentValue,
      consumption,
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

    // Запрет: текущее показание не может быть меньше последнего отправленного.
    const lastEntry = history.length
      ? [...history].sort((a, b) => {
          const ay = Number(a.year ?? 0);
          const by = Number(b.year ?? 0);
          if (ay !== by) return by - ay;
          return Number(b.month ?? 0) - Number(a.month ?? 0);
        })[0]
      : null;
    const lastValue = lastEntry
      ? Number(lastEntry.currentValue ?? lastEntry.previousValue ?? 0)
      : Number((meterGroup as Record<string, unknown>).currentValue ?? 0);
    if (Number.isFinite(lastValue) && reading.currentValue < lastValue) {
      throw new BadRequestException(
        `Current reading (${reading.currentValue}) cannot be lower than the previous (${lastValue})`,
      );
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
    if (isPropertyMemberRole(user.role)) {
      if (!this.hasApartmentAccess(user, apartmentId, apartment)) {
        throw new ForbiddenException('Access denied for apartment');
      }
    } else if (isStaffRole(user.role)) {
      this.assertStaffApartmentCompanyAccess(user, apartment);
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
    if (isPropertyMemberRole(user.role)) {
      if (!this.hasApartmentAccess(user, apartmentId, apartment)) {
        throw new ForbiddenException('Access denied for apartment');
      }
    } else if (isStaffRole(user.role)) {
      this.assertStaffApartmentCompanyAccess(user, apartment);
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
    // Property members (residents/owners/tenants) can only delete current-month readings.
    // Staff (ManagementCompany / Accountant) can delete readings from any period.
    if (isPropertyMemberRole(user.role)) {
      if (
        !submittedAt ||
        Number.isNaN(submittedAt.getTime()) ||
        submittedAt.getFullYear() !== now.getFullYear() ||
        submittedAt.getMonth() !== now.getMonth()
      ) {
        throw new ForbiddenException('Cannot delete readings from previous months');
      }
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

  async sendTestReminder(user: RequestUser) {
    this.assertAuthenticated(user);

    // Получаем информацию об УК пользователя
    const db = this.firebaseAdminService.firestore;
    
    const companyEmail = user.email;
    if (!companyEmail) {
      throw new BadRequestException('Company email not found');
    }

    // Получаем первое здание компании для примера
    const companyId = user.companyId || '';
    if (!companyId) {
      throw new BadRequestException('Company ID not found for this user');
    }

    const [snap1, snap2] = await Promise.all([
      db.collection('buildings').where('companyId', '==', companyId).limit(1).get(),
      db.collection('buildings').where('managedBy.companyId', '==', companyId).limit(1).get(),
    ]);
    const buildingsSnapshot = !snap1.empty ? snap1 : snap2;

    if (buildingsSnapshot.empty) {
      throw new NotFoundException('No buildings found for this company');
    }

    const building = buildingsSnapshot.docs[0].data();
    const buildingName = building.name || building.address || 'Test Building';

    // Отправляем тестовое письмо
    await this.emailService.sendMeterReadingReminder({
      to: companyEmail,
      language: 'en',
      submissionLink: '',
      buildingName: buildingName,
      apartmentNumber: 'Apt 1',
      deadline: '27.05.2026',
    });

    return { success: true, message: 'Test reminder sent to ' + companyEmail };
  }
}
