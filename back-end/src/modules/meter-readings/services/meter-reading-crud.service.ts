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
import { TooManyRequestsException } from '../../../common/errors/too-many-requests.exception';
import { sanitizeClientPayload } from '../../../common/utils/client-payload';
import { runInBackground } from '../../../common/utils/background';

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
      this.rateLimitService.buildKey(request, 'meter-readings:submit', `${user.uid}:${apartmentId}`),
      20,
      60_000,
    );
    if (!rl.allowed) throw new TooManyRequestsException(rl.resetAt);

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

    const preferredKey = METER_READING_KEYS.includes(payload.meterKey as MeterReadingKey)
      ? payload.meterKey as MeterReadingKey
      : undefined;
    const resolveKey = (wr: Record<string, unknown>): MeterReadingKey =>
      METER_READING_KEYS.find((k) => (wr[k] as Record<string, unknown> | undefined)?.meterId === meterId)
      ?? preferredKey
      ?? 'coldmeterwater';
    const initialKey = resolveKey((apartment.waterReadings ?? {}) as Record<string, unknown>);
    const forceMultipleMonthlyElectricityReadings = payload.allowMultipleMonthly === true
      || reading.source === 'electricity_invoice'
      || reading.meterReadingSource === 'electricity_invoice';
    // Building config read stays outside the transaction (it does not change with the reading).
    const buildingAllowsMultiple = initialKey === 'electricitymeter' && !forceMultipleMonthlyElectricityReadings
      ? await this.buildingService.electricityAllowsMultipleMonthlySubmissions(apartment, payload.buildingId)
      : false;

    // Read-validate-write in one transaction and write only this meter's group: concurrent
    // submissions (e.g. cold + hot water) used to overwrite each other through the stale
    // `...waterReadings` spread, and the monthly duplicate check could be raced.
    await db.runTransaction(async (tx) => {
      const freshSnap = await tx.get(apartmentRef);
      if (!freshSnap.exists) throw new NotFoundException('Apartment not found');
      const wr = ((freshSnap.data() as Record<string, unknown>).waterReadings ?? {}) as Record<string, unknown>;
      const key = resolveKey(wr);
      const meterGroup = (wr[key] as Record<string, unknown> | undefined) ?? { meterId, history: [] };
      const history = Array.isArray(meterGroup.history) ? [...(meterGroup.history as Record<string, unknown>[])] : [];

      const allowMultipleMonthlyElectricityReadings = key === 'electricitymeter'
        ? forceMultipleMonthlyElectricityReadings || (initialKey === 'electricitymeter'
          ? buildingAllowsMultiple
          : await this.buildingService.electricityAllowsMultipleMonthlySubmissions(apartment, payload.buildingId))
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

      tx.set(
        apartmentRef,
        {
          waterReadings: {
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
    });

    runInBackground(this.auditLogService.write({
      request,
      action: 'meter_reading.submit',
      status: 'success',
      actorUid: user.uid,
      actorRole: user.role,
      companyId: user.companyId,
      apartmentId,
      metadata: { meterId, month, year },
    }), 'audit');

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
    // A property member may submit a reading, but must never be able to
    // rewrite an already submitted value through the API.
    if (isPropertyMemberRole(user.role)) {
      throw new ForbiddenException('Residents cannot edit meter readings');
    }

    const rl = await this.rateLimitService.consume(
      this.rateLimitService.buildKey(request, 'meter-reading:update', `${user.uid}:${readingId}`),
      30,
      60_000,
    );
    if (!rl.allowed) throw new TooManyRequestsException(rl.resetAt);

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

    let buildingAllowsMultiple: boolean | undefined;
    const foundKey = await db.runTransaction(async (tx) => {
      const freshSnap = await tx.get(apartmentRef);
      if (!freshSnap.exists) throw new NotFoundException('Apartment not found');
      const wr = ((freshSnap.data() as Record<string, unknown>).waterReadings ?? {}) as Record<string, unknown>;
      let key: MeterReadingKey | null = null;
      let group: Record<string, unknown> | null = null;
      let index = -1;
      for (const candidate of METER_READING_KEYS) {
        const candidateGroup = wr[candidate] as Record<string, unknown> | undefined;
        if (!candidateGroup || !Array.isArray(candidateGroup.history)) continue;
        const idx = (candidateGroup.history as Record<string, unknown>[]).findIndex((h) => String(h.id ?? '') === readingId);
        if (idx >= 0) {
          key = candidate;
          group = candidateGroup;
          index = idx;
          break;
        }
      }
      if (!key || !group || index < 0) throw new NotFoundException('Reading not found');

      const history = [...(group.history as Record<string, unknown>[])];
      history[index] = {
        ...history[index],
        ...sanitizeClientPayload(payload, { protectedKeys: ['apartmentId', 'meterId'] }),
        id: history[index].id,
      };
      if (key === 'electricitymeter' && buildingAllowsMultiple === undefined) {
        buildingAllowsMultiple = await this.buildingService.electricityAllowsMultipleMonthlySubmissions(apartment);
      }
      const allowMultipleMonthlyElectricityReadings = key === 'electricitymeter'
        ? this.helperService.hasInvoiceLinkedElectricityReadings(history) || buildingAllowsMultiple === true
        : false;
      const { history: recalculatedHistory, latestReading } = buildMeterHistorySnapshot(history as never[], {
        collapseMonthly: !allowMultipleMonthlyElectricityReadings,
      });

      tx.set(
        apartmentRef,
        {
          waterReadings: {
            [key]: {
              ...group,
              history: recalculatedHistory,
              currentValue: latestReading?.currentValue ?? null,
              previousValue: latestReading?.previousValue ?? null,
              submittedAt: latestReading?.submittedAt ?? null,
            },
          },
        },
        { merge: true },
      );
      return key;
    });

    runInBackground(this.auditLogService.write({
      request,
      action: 'meter_reading.update',
      status: 'success',
      actorUid: user.uid,
      actorRole: user.role,
      companyId: user.companyId,
      apartmentId,
      metadata: { readingId, meterKey: foundKey },
    }), 'audit');

    return { success: true };
  }

  async remove(request: Request, user: RequestUser, readingId: string, apartmentId: string) {
    this.accessService.assertAuthenticated(user);
    if (!readingId || !apartmentId) {
      throw new BadRequestException('readingId and apartmentId are required');
    }
    // Deletion follows the same rule as editing: only authorised staff can
    // change the submitted meter-reading history.
    if (isPropertyMemberRole(user.role)) {
      throw new ForbiddenException('Residents cannot delete meter readings');
    }

    const rl = await this.rateLimitService.consume(
      this.rateLimitService.buildKey(request, 'meter-reading:delete', `${user.uid}:${readingId}`),
      20,
      60_000,
    );
    if (!rl.allowed) throw new TooManyRequestsException(rl.resetAt);

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

    let buildingAllowsMultiple: boolean | undefined;
    const { foundKey, submittedAt } = await db.runTransaction(async (tx) => {
      const freshSnap = await tx.get(apartmentRef);
      if (!freshSnap.exists) throw new NotFoundException('Apartment not found');
      const wr = ((freshSnap.data() as Record<string, unknown>).waterReadings ?? {}) as Record<string, unknown>;
      let key: MeterReadingKey | null = null;
      let group: Record<string, unknown> | null = null;
      let entry: Record<string, unknown> | null = null;
      for (const candidate of METER_READING_KEYS) {
        const candidateGroup = wr[candidate] as Record<string, unknown> | undefined;
        if (!candidateGroup || !Array.isArray(candidateGroup.history)) continue;
        const match = (candidateGroup.history as Record<string, unknown>[]).find((h) => String(h.id ?? '') === readingId);
        if (match) {
          key = candidate;
          group = candidateGroup;
          entry = match;
          break;
        }
      }
      if (!key || !group || !entry) throw new NotFoundException('Reading not found');

      const submittedAtRaw = entry.submittedAt as { toDate?: () => Date } | Date | string | undefined;
      const entrySubmittedAt =
        submittedAtRaw instanceof Date
          ? submittedAtRaw
          : typeof submittedAtRaw === 'string'
            ? new Date(submittedAtRaw)
            : typeof submittedAtRaw?.toDate === 'function'
              ? submittedAtRaw.toDate()
              : null;
      const history = (group.history as Record<string, unknown>[]).filter((h) => String(h.id ?? '') !== readingId);
      if (key === 'electricitymeter' && buildingAllowsMultiple === undefined) {
        buildingAllowsMultiple = await this.buildingService.electricityAllowsMultipleMonthlySubmissions(apartment);
      }
      const allowMultipleMonthlyElectricityReadings = key === 'electricitymeter'
        ? this.helperService.hasInvoiceLinkedElectricityReadings(history) || buildingAllowsMultiple === true
        : false;
      const { history: recalculatedHistory, latestReading } = buildMeterHistorySnapshot(history as never[], {
        collapseMonthly: !allowMultipleMonthlyElectricityReadings,
      });

      tx.set(
        apartmentRef,
        {
          waterReadings: {
            [key]: {
              ...group,
              history: recalculatedHistory,
              currentValue: latestReading?.currentValue ?? null,
              previousValue: latestReading?.previousValue ?? null,
              submittedAt: latestReading?.submittedAt ?? null,
            },
          },
        },
        { merge: true },
      );
      return { foundKey: key, submittedAt: entrySubmittedAt };
    });

    runInBackground(this.auditLogService.write({
      request,
      action: 'meter_reading.delete',
      status: 'success',
      actorUid: user.uid,
      actorRole: user.role,
      companyId: user.companyId,
      apartmentId,
      metadata: { readingId, meterKey: foundKey, submittedAt: submittedAt?.toISOString() },
    }), 'audit');

    return { success: true };
  }
}
