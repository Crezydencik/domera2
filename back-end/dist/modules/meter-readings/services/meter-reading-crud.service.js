"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MeterReadingCrudService = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const role_constants_1 = require("../../../common/auth/role.constants");
const firebase_admin_service_1 = require("../../../common/infrastructure/firebase/firebase-admin.service");
const audit_log_service_1 = require("../../../common/services/audit-log.service");
const rate_limit_service_1 = require("../../../common/services/rate-limit.service");
const meter_reading_history_1 = require("../../../common/utils/meter-reading-history");
const meter_reading_types_1 = require("../types/meter-reading.types");
const meter_reading_access_service_1 = require("./meter-reading-access.service");
const meter_reading_building_service_1 = require("./meter-reading-building.service");
const meter_reading_helper_service_1 = require("./meter-reading-helper.service");
let MeterReadingCrudService = class MeterReadingCrudService {
    constructor(firebaseAdminService, rateLimitService, auditLogService, accessService, buildingService, helperService) {
        this.firebaseAdminService = firebaseAdminService;
        this.rateLimitService = rateLimitService;
        this.auditLogService = auditLogService;
        this.accessService = accessService;
        this.buildingService = buildingService;
        this.helperService = helperService;
    }
    async create(request, user, payload) {
        this.accessService.assertAuthenticated(user);
        const apartmentId = typeof payload.apartmentId === 'string' ? payload.apartmentId : '';
        const meterId = typeof payload.meterId === 'string' ? payload.meterId : '';
        if (!apartmentId || !meterId) {
            throw new common_1.BadRequestException('apartmentId and meterId are required');
        }
        const rl = await this.rateLimitService.consume(this.rateLimitService.buildKey(request, 'meter-readings:submit', apartmentId), 20, 60_000);
        if (!rl.allowed)
            throw new common_1.BadRequestException('Too many requests');
        const db = this.firebaseAdminService.firestore;
        const apartmentRef = db.collection('apartments').doc(apartmentId);
        const apartmentSnap = await apartmentRef.get();
        if (!apartmentSnap.exists)
            throw new common_1.NotFoundException('Apartment not found');
        const apartment = apartmentSnap.data();
        if ((0, role_constants_1.isPropertyMemberRole)(user.role)) {
            if (!this.accessService.hasApartmentAccess(user, apartmentId, apartment)) {
                throw new common_1.ForbiddenException('Access denied for apartment');
            }
        }
        else if ((0, role_constants_1.isStaffRole)(user.role)) {
            await this.accessService.assertCanManageStaffMeterReadings(user, apartment);
        }
        const now = new Date();
        const staffSubmission = (0, role_constants_1.isStaffRole)(user.role);
        const currentPeriod = this.helperService.currentReadingPeriod(now);
        const payloadMonth = Number(payload.month);
        const payloadYear = Number(payload.year);
        const hasValidPayloadPeriod = Number.isFinite(payloadMonth) &&
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
        const reading = {
            id: (0, node_crypto_1.randomUUID)(),
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
        const wr = (apartment.waterReadings ?? {});
        const namedKey = meter_reading_types_1.METER_READING_KEYS.find((k) => wr[k]?.meterId === meterId);
        const preferredKey = meter_reading_types_1.METER_READING_KEYS.includes(payload.meterKey)
            ? payload.meterKey
            : undefined;
        const key = namedKey ?? preferredKey ?? 'coldmeterwater';
        const meterGroup = wr[key] ?? { meterId, history: [] };
        const history = Array.isArray(meterGroup.history) ? [...meterGroup.history] : [];
        const forceMultipleMonthlyElectricityReadings = key === 'electricitymeter'
            && (payload.allowMultipleMonthly === true || reading.source === 'electricity_invoice' || reading.meterReadingSource === 'electricity_invoice');
        const allowMultipleMonthlyElectricityReadings = key === 'electricitymeter'
            ? forceMultipleMonthlyElectricityReadings || await this.buildingService.electricityAllowsMultipleMonthlySubmissions(apartment, payload.buildingId)
            : false;
        const duplicate = !allowMultipleMonthlyElectricityReadings
            && history.some((h) => Number(h.month) === month && Number(h.year) === year);
        if (duplicate) {
            throw new common_1.ForbiddenException('Reading already exists for current month');
        }
        const lastEntry = history.length
            ? [...history].sort((a, b) => {
                const ay = Number(a.year ?? 0);
                const by = Number(b.year ?? 0);
                if (ay !== by)
                    return by - ay;
                const monthDiff = Number(b.month ?? 0) - Number(a.month ?? 0);
                if (monthDiff !== 0)
                    return monthDiff;
                return this.helperService.historySubmittedAtTime(b.submittedAt) - this.helperService.historySubmittedAtTime(a.submittedAt);
            })[0]
            : null;
        const lastValue = lastEntry
            ? Number(lastEntry.currentValue ?? lastEntry.previousValue ?? 0)
            : Number(meterGroup.currentValue ?? 0);
        if (Number.isFinite(lastValue) && reading.currentValue < lastValue) {
            throw new common_1.BadRequestException(`Current reading (${reading.currentValue}) cannot be lower than the previous (${lastValue})`);
        }
        history.push(reading);
        const { history: recalculatedHistory, latestReading } = (0, meter_reading_history_1.buildMeterHistorySnapshot)(history, {
            collapseMonthly: !allowMultipleMonthlyElectricityReadings,
        });
        await apartmentRef.set({
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
        }, { merge: true });
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
    async update(request, user, readingId, apartmentId, payload) {
        this.accessService.assertAuthenticated(user);
        if (!readingId || !apartmentId) {
            throw new common_1.BadRequestException('readingId and apartmentId are required');
        }
        const rl = await this.rateLimitService.consume(this.rateLimitService.buildKey(request, 'meter-reading:update', readingId), 30, 60_000);
        if (!rl.allowed)
            throw new common_1.BadRequestException('Too many requests');
        const db = this.firebaseAdminService.firestore;
        const apartmentRef = db.collection('apartments').doc(apartmentId);
        const apartmentSnap = await apartmentRef.get();
        if (!apartmentSnap.exists)
            throw new common_1.NotFoundException('Apartment not found');
        const apartment = apartmentSnap.data();
        if ((0, role_constants_1.isPropertyMemberRole)(user.role)) {
            if (!this.accessService.hasApartmentAccess(user, apartmentId, apartment)) {
                throw new common_1.ForbiddenException('Access denied for apartment');
            }
        }
        else if ((0, role_constants_1.isStaffRole)(user.role)) {
            await this.accessService.assertCanManageStaffMeterReadings(user, apartment);
        }
        const wr = (apartment.waterReadings ?? {});
        let foundKey = null;
        let foundGroup = null;
        let foundIndex = -1;
        for (const key of meter_reading_types_1.METER_READING_KEYS) {
            const group = wr[key];
            if (!group || !Array.isArray(group.history))
                continue;
            const idx = group.history.findIndex((h) => String(h.id ?? '') === readingId);
            if (idx >= 0) {
                foundKey = key;
                foundGroup = group;
                foundIndex = idx;
                break;
            }
        }
        if (!foundKey || !foundGroup || foundIndex < 0)
            throw new common_1.NotFoundException('Reading not found');
        const history = [...foundGroup.history];
        history[foundIndex] = { ...history[foundIndex], ...payload, id: history[foundIndex].id };
        const allowMultipleMonthlyElectricityReadings = foundKey === 'electricitymeter'
            ? this.helperService.hasInvoiceLinkedElectricityReadings(history) || await this.buildingService.electricityAllowsMultipleMonthlySubmissions(apartment)
            : false;
        const { history: recalculatedHistory, latestReading } = (0, meter_reading_history_1.buildMeterHistorySnapshot)(history, {
            collapseMonthly: !allowMultipleMonthlyElectricityReadings,
        });
        await apartmentRef.set({
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
        }, { merge: true });
        return { success: true };
    }
    async remove(request, user, readingId, apartmentId) {
        this.accessService.assertAuthenticated(user);
        if (!readingId || !apartmentId) {
            throw new common_1.BadRequestException('readingId and apartmentId are required');
        }
        const rl = await this.rateLimitService.consume(this.rateLimitService.buildKey(request, 'meter-reading:delete', readingId), 20, 60_000);
        if (!rl.allowed)
            throw new common_1.BadRequestException('Too many requests');
        const db = this.firebaseAdminService.firestore;
        const apartmentRef = db.collection('apartments').doc(apartmentId);
        const apartmentSnap = await apartmentRef.get();
        if (!apartmentSnap.exists)
            throw new common_1.NotFoundException('Apartment not found');
        const apartment = apartmentSnap.data();
        if ((0, role_constants_1.isPropertyMemberRole)(user.role)) {
            if (!this.accessService.hasApartmentAccess(user, apartmentId, apartment)) {
                throw new common_1.ForbiddenException('Access denied for apartment');
            }
        }
        else if ((0, role_constants_1.isStaffRole)(user.role)) {
            await this.accessService.assertCanManageStaffMeterReadings(user, apartment);
        }
        const wr = (apartment.waterReadings ?? {});
        let foundKey = null;
        let foundGroup = null;
        let foundEntry = null;
        for (const key of meter_reading_types_1.METER_READING_KEYS) {
            const group = wr[key];
            if (!group || !Array.isArray(group.history))
                continue;
            const entry = group.history.find((h) => String(h.id ?? '') === readingId);
            if (entry) {
                foundKey = key;
                foundGroup = group;
                foundEntry = entry;
                break;
            }
        }
        if (!foundKey || !foundGroup || !foundEntry)
            throw new common_1.NotFoundException('Reading not found');
        const submittedAtRaw = foundEntry.submittedAt;
        const submittedAt = submittedAtRaw instanceof Date
            ? submittedAtRaw
            : typeof submittedAtRaw === 'string'
                ? new Date(submittedAtRaw)
                : typeof submittedAtRaw?.toDate === 'function'
                    ? submittedAtRaw.toDate()
                    : null;
        const now = new Date();
        if ((0, role_constants_1.isPropertyMemberRole)(user.role)) {
            if (!submittedAt ||
                Number.isNaN(submittedAt.getTime()) ||
                submittedAt.getFullYear() !== now.getFullYear() ||
                submittedAt.getMonth() !== now.getMonth()) {
                throw new common_1.ForbiddenException('Cannot delete readings from previous months');
            }
        }
        const history = foundGroup.history.filter((h) => String(h.id ?? '') !== readingId);
        const allowMultipleMonthlyElectricityReadings = foundKey === 'electricitymeter'
            ? this.helperService.hasInvoiceLinkedElectricityReadings(history) || await this.buildingService.electricityAllowsMultipleMonthlySubmissions(apartment)
            : false;
        const { history: recalculatedHistory, latestReading } = (0, meter_reading_history_1.buildMeterHistorySnapshot)(history, {
            collapseMonthly: !allowMultipleMonthlyElectricityReadings,
        });
        await apartmentRef.set({
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
        }, { merge: true });
        return { success: true };
    }
};
exports.MeterReadingCrudService = MeterReadingCrudService;
exports.MeterReadingCrudService = MeterReadingCrudService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        rate_limit_service_1.RateLimitService,
        audit_log_service_1.AuditLogService,
        meter_reading_access_service_1.MeterReadingAccessService,
        meter_reading_building_service_1.MeterReadingBuildingService,
        meter_reading_helper_service_1.MeterReadingHelperService])
], MeterReadingCrudService);
