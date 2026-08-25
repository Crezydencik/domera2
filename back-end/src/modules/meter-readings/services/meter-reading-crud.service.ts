import { randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import { isPropertyMemberRole, isStaffRole } from '../../../common/auth/role.constants';
import { RequestUser } from '../../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { AuditLogService } from '../../../common/services/audit-log.service';
import { RateLimitService } from '../../../common/services/rate-limit.service';
import { buildMeterHistorySnapshot } from '../../../common/utils/meter-reading-history';
import { MeterReadingKey, METER_READING_KEYS } from '../types/meter-reading.types';
import { MeterReadingAccessService } from './meter-reading-access.service';
import { MeterReadingBuildingService } from './meter-reading-building.service';
import { MeterReadingHelperService } from './meter-reading-helper.service';

@Injectable()
export class MeterReadingCrudService {
  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly rateLimitService: RateLimitService,
    private readonly auditLogService: AuditLogService,
    private readonly accessService: MeterReadingAccessService,
    private readonly buildingService: MeterReadingBuildingService,
    private readonly helperService: MeterReadingHelperService,
  ) {}

  async create(request: Request, user: RequestUser, payload: Record<string, unknown>) {
    this.accessService.assertAuthenticated(user);

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
      if (!this.accessService.hasApartmentAccess(user, apartmentId, apartment)) {
        throw new ForbiddenException('Access denied for apartment');
      }
    } else if (isStaffRole(user.role)) {
      await this.accessService.assertCanManageStaffMeterReadings(user, apartment);
    }

    const now = new Date();
    const staffSubmission = isStaffRole(user.role);
    const currentPeriod = this.helperService.currentReadingPeriod(now);
    const payloadMonth = Number(payload.month);
    const payloadYear = Number(payload.year);
    const hasValidPayloadPeriod =
      Number.isFinite(payloadMonth) &&
      payloadMonth >= 1 &&
      payloadMonth <= 12 &&
      Number.isFinite(payloadYear) &&
      payloadYear >= 2000;
    const month = staffSubmission && hasValidPayloadPeriod ? payloadMonth : currentPeriod.month;
    const year = staffSubmission && hasValidPayloadPeriod ? payloadYear : currentPeriod.year;

    const previousValue = Number(payload.previousValue ?? 0);
    const currentValue = Number(payload.currentValue ?? 0);
    const consumption = Number.isFinite(currentValue) && Number.isFinite(previousValue)
      ? Number(Math.max(0, currentValue - previousValue).toFixed(3))
      : 0;

    const reading: Record<string, unknown> & {
      currentValue: number;
      previousValue: number;
      source?: string;
      meterReadingSource?: string;
    } = {
      id: randomUUID(),
      apartmentId,
      meterId,
      submittedAt: now,
      previousValue,
      currentValue,
      consumption,
      buildingId: typeof payload.buildingId === 'string' ? payload.buildingId : '',
      month,
      year,
    };
    if (typeof payload.source === 'string' && payload.source.trim()) {
      reading.source = payload.source.trim();
    }
    if (typeof payload.meterReadingSource === 'string' && payload.meterReadingSource.trim()) {
      reading.meterReadingSource = payload.meterReadingSource.trim();
    }
    if (typeof payload.linkedInvoiceId === 'string' && payload.linkedInvoiceId.trim()) {
      reading.linkedInvoiceId = payload.linkedInvoiceId.trim();
    }
    if (typeof payload.linkedInvoiceExternalId === 'string' && payload.linkedInvoiceExternalId.trim()) {
      reading.linkedInvoiceExternalId = payload.linkedInvoiceExternalId.trim();
    }

    const wr = (apartment.waterReadings ?? {}) as Record<string, unknown>;
    const namedKey = METER_READING_KEYS.find(
      (k) => (wr[k] as Record<string, unknown> | undefined)?.meterId === meterId,
    );
    const preferredKey = METER_READING_KEYS.includes(payload.meterKey as MeterReadingKey)
      ? payload.meterKey as MeterReadingKey
      : undefined;
    const key = namedKey ?? preferredKey ?? 'coldmeterwater';
    const meterGroup = (wr[key] as Record<string, unknown> | undefined) ?? { meterId, history: [] };
    const history = Array.isArray(meterGroup.history) ? [...(meterGroup.history as Record<string, unknown>[])] : [];

    const forceMultipleMonthlyElectricityReadings = key === 'electricitymeter'
      && (payload.allowMultipleMonthly === true || reading.source === 'electricity_invoice' || reading.meterReadingSource === 'electricity_invoice');
    const allowMultipleMonthlyElectricityReadings = key === 'electricitymeter'
      ? forceMultipleMonthlyElectricityReadings || await this.buildingService.electricityAllowsMultipleMonthlySubmissions(apartment, payload.buildingId)
      : false;
    const duplicate = !allowMultipleMonthlyElectricityReadings
      && history.some((h) => Number(h.month) === month && Number(h.year) === year);
    if (duplicate) {
      throw new ForbiddenException('Reading already exists for current month');
    }

    const lastEntry = history.length
      ? [...history].sort((a, b) => {
          const ay = Number(a.year ?? 0);
          const by = Number(b.year ?? 0);
          if (ay !== by) return by - ay;
          const monthDiff = Number(b.month ?? 0) - Number(a.month ?? 0);
          if (monthDiff !== 0) return monthDiff;
          return this.helperService.historySubmittedAtTime(b.submittedAt) - this.helperService.historySubmittedAtTime(a.submittedAt);
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
    const { history: recalculatedHistory, latestReading } = buildMeterHistorySnapshot(history as never[], {
      collapseMonthly: !allowMultipleMonthlyElectricityReadings,
    });

    await apartmentRef.set(
      {
        waterReadings: {
          ...wr,
          [key]: {
            ...meterGroup,
            meterId,
            ...(key === 'electricitymeter'
              ? { meterDigits: Math.min(7, Math.max(5, Number(payload.meterDigits ?? meterGroup.meterDigits ?? 6) || 6)) }
              : {}),
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
    this.accessService.assertAuthenticated(user);
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
      if (!this.accessService.hasApartmentAccess(user, apartmentId, apartment)) {
        throw new ForbiddenException('Access denied for apartment');
      }
    } else if (isStaffRole(user.role)) {
      await this.accessService.assertCanManageStaffMeterReadings(user, apartment);
    }

    const wr = (apartment.waterReadings ?? {}) as Record<string, unknown>;
    let foundKey: MeterReadingKey | null = null;
    let foundGroup: Record<string, unknown> | null = null;
    let foundIndex = -1;
    for (const key of METER_READING_KEYS) {
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
    const allowMultipleMonthlyElectricityReadings = foundKey === 'electricitymeter'
      ? this.helperService.hasInvoiceLinkedElectricityReadings(history) || await this.buildingService.electricityAllowsMultipleMonthlySubmissions(apartment)
      : false;
    const { history: recalculatedHistory, latestReading } = buildMeterHistorySnapshot(history as never[], {
      collapseMonthly: !allowMultipleMonthlyElectricityReadings,
    });

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
    this.accessService.assertAuthenticated(user);
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
      if (!this.accessService.hasApartmentAccess(user, apartmentId, apartment)) {
        throw new ForbiddenException('Access denied for apartment');
      }
    } else if (isStaffRole(user.role)) {
      await this.accessService.assertCanManageStaffMeterReadings(user, apartment);
    }

    const wr = (apartment.waterReadings ?? {}) as Record<string, unknown>;
    let foundKey: MeterReadingKey | null = null;
    let foundGroup: Record<string, unknown> | null = null;
    let foundEntry: Record<string, unknown> | null = null;
    for (const key of METER_READING_KEYS) {
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
    const allowMultipleMonthlyElectricityReadings = foundKey === 'electricitymeter'
      ? this.helperService.hasInvoiceLinkedElectricityReadings(history) || await this.buildingService.electricityAllowsMultipleMonthlySubmissions(apartment)
      : false;
    const { history: recalculatedHistory, latestReading } = buildMeterHistorySnapshot(history as never[], {
      collapseMonthly: !allowMultipleMonthlyElectricityReadings,
    });

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
