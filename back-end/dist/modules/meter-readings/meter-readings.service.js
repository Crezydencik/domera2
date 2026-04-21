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
exports.MeterReadingsService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const firebase_admin_service_1 = require("../../common/infrastructure/firebase/firebase-admin.service");
const role_constants_1 = require("../../common/auth/role.constants");
const audit_log_service_1 = require("../../common/services/audit-log.service");
const rate_limit_service_1 = require("../../common/services/rate-limit.service");
const meter_reading_history_1 = require("../../common/utils/meter-reading-history");
const invitation_token_1 = require("../../common/utils/invitation-token");
let MeterReadingsService = class MeterReadingsService {
    constructor(firebaseAdminService, rateLimitService, auditLogService) {
        this.firebaseAdminService = firebaseAdminService;
        this.rateLimitService = rateLimitService;
        this.auditLogService = auditLogService;
    }
    assertAuthenticated(user) {
        if (!user?.uid || !user.role)
            throw new common_1.UnauthorizedException('Authentication required');
        if (!(0, role_constants_1.isPropertyMemberRole)(user.role) && !(0, role_constants_1.isStaffRole)(user.role)) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
    }
    hasApartmentAccess(user, apartmentId, apartment) {
        const normalizedUserEmail = (0, invitation_token_1.normalizeEmail)(user.email ?? '');
        const ownerEmail = typeof apartment.ownerEmail === 'string' ? (0, invitation_token_1.normalizeEmail)(apartment.ownerEmail) : '';
        const isOwner = Boolean(normalizedUserEmail && ownerEmail && normalizedUserEmail === ownerEmail);
        const isClaimApartment = Boolean(user.apartmentId && user.apartmentId === apartmentId);
        const isPrimaryResident = typeof apartment.residentId === 'string' && apartment.residentId === user.uid;
        const isTenantWithSubmit = Array.isArray(apartment.tenants) &&
            apartment.tenants.some((tenant) => {
                if (!tenant || typeof tenant !== 'object')
                    return false;
                const t = tenant;
                const userId = typeof t.userId === 'string' ? t.userId : '';
                const permissions = Array.isArray(t.permissions)
                    ? t.permissions.filter((p) => typeof p === 'string')
                    : [];
                return userId === user.uid && permissions.includes('submitMeter');
            });
        return isOwner || isClaimApartment || isPrimaryResident || isTenantWithSubmit;
    }
    extractApartmentReadings(apartmentId, apartment) {
        const wr = (apartment.waterReadings ?? {});
        const entries = [];
        for (const key of ['coldmeterwater', 'hotmeterwater']) {
            const group = wr[key];
            if (!group || !Array.isArray(group.history))
                continue;
            for (const item of group.history) {
                entries.push({ ...item, apartmentId: String(item.apartmentId ?? apartmentId), meterKey: key });
            }
        }
        return entries;
    }
    async list(user, apartmentId, companyId) {
        this.assertAuthenticated(user);
        const db = this.firebaseAdminService.firestore;
        if (apartmentId) {
            const snap = await db.collection('apartments').doc(apartmentId).get();
            if (!snap.exists)
                throw new common_1.NotFoundException('Apartment not found');
            const apartment = snap.data();
            const companyIds = Array.isArray(apartment.companyIds)
                ? apartment.companyIds.filter((x) => typeof x === 'string')
                : [];
            if ((0, role_constants_1.isPropertyMemberRole)(user.role)) {
                if (!this.hasApartmentAccess(user, apartmentId, apartment)) {
                    throw new common_1.ForbiddenException('Access denied for apartment');
                }
            }
            else if (user.companyId && !companyIds.includes(user.companyId)) {
                throw new common_1.ForbiddenException('Access denied for company');
            }
            return { items: this.extractApartmentReadings(apartmentId, apartment) };
        }
        if ((0, role_constants_1.isPropertyMemberRole)(user.role)) {
            return { items: [] };
        }
        const effectiveCompanyId = companyId || user.companyId;
        if (!effectiveCompanyId)
            return { items: [] };
        if (user.companyId && user.companyId !== effectiveCompanyId) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        const snap = await db.collection('apartments').where('companyIds', 'array-contains', effectiveCompanyId).get();
        const items = snap.docs.flatMap((doc) => this.extractApartmentReadings(doc.id, doc.data()));
        return { items };
    }
    async create(request, user, payload) {
        this.assertAuthenticated(user);
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
        const companyIds = Array.isArray(apartment.companyIds)
            ? apartment.companyIds.filter((x) => typeof x === 'string')
            : [];
        if ((0, role_constants_1.isPropertyMemberRole)(user.role)) {
            if (!this.hasApartmentAccess(user, apartmentId, apartment)) {
                throw new common_1.ForbiddenException('Access denied for apartment');
            }
        }
        else if (user.companyId && !companyIds.includes(user.companyId)) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        const now = new Date();
        const month = typeof payload.month === 'number' ? payload.month : now.getMonth() + 1;
        const year = typeof payload.year === 'number' ? payload.year : now.getFullYear();
        const reading = {
            id: (0, node_crypto_1.randomUUID)(),
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
        const wr = (apartment.waterReadings ?? {});
        const namedKey = ['coldmeterwater', 'hotmeterwater'].find((k) => wr[k]?.meterId === meterId);
        const preferredKey = payload.meterKey === 'coldmeterwater' || payload.meterKey === 'hotmeterwater'
            ? payload.meterKey
            : undefined;
        const key = namedKey ?? preferredKey ?? 'coldmeterwater';
        const meterGroup = wr[key] ?? { meterId, history: [] };
        const history = Array.isArray(meterGroup.history) ? [...meterGroup.history] : [];
        const duplicate = history.some((h) => Number(h.month) === month && Number(h.year) === year);
        if (duplicate) {
            throw new common_1.ForbiddenException('Reading already exists for current month');
        }
        history.push(reading);
        const { history: recalculatedHistory, latestReading } = (0, meter_reading_history_1.buildMeterHistorySnapshot)(history);
        await apartmentRef.set({
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
        this.assertAuthenticated(user);
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
        const companyIds = Array.isArray(apartment.companyIds)
            ? apartment.companyIds.filter((x) => typeof x === 'string')
            : [];
        if ((0, role_constants_1.isPropertyMemberRole)(user.role)) {
            if (!this.hasApartmentAccess(user, apartmentId, apartment)) {
                throw new common_1.ForbiddenException('Access denied for apartment');
            }
        }
        else if (user.companyId && !companyIds.includes(user.companyId)) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        const wr = (apartment.waterReadings ?? {});
        let foundKey = null;
        let foundGroup = null;
        let foundIndex = -1;
        for (const key of ['coldmeterwater', 'hotmeterwater']) {
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
        const { history: recalculatedHistory, latestReading } = (0, meter_reading_history_1.buildMeterHistorySnapshot)(history);
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
        this.assertAuthenticated(user);
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
        const companyIds = Array.isArray(apartment.companyIds)
            ? apartment.companyIds.filter((x) => typeof x === 'string')
            : [];
        if ((0, role_constants_1.isPropertyMemberRole)(user.role)) {
            if (!this.hasApartmentAccess(user, apartmentId, apartment)) {
                throw new common_1.ForbiddenException('Access denied for apartment');
            }
        }
        else if (user.companyId && !companyIds.includes(user.companyId)) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        const wr = (apartment.waterReadings ?? {});
        let foundKey = null;
        let foundGroup = null;
        let foundEntry = null;
        for (const key of ['coldmeterwater', 'hotmeterwater']) {
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
        if (!submittedAt ||
            Number.isNaN(submittedAt.getTime()) ||
            submittedAt.getFullYear() !== now.getFullYear() ||
            submittedAt.getMonth() !== now.getMonth()) {
            throw new common_1.ForbiddenException('Cannot delete readings from previous months');
        }
        const history = foundGroup.history.filter((h) => String(h.id ?? '') !== readingId);
        const { history: recalculatedHistory, latestReading } = (0, meter_reading_history_1.buildMeterHistorySnapshot)(history);
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
exports.MeterReadingsService = MeterReadingsService;
exports.MeterReadingsService = MeterReadingsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        rate_limit_service_1.RateLimitService,
        audit_log_service_1.AuditLogService])
], MeterReadingsService);
