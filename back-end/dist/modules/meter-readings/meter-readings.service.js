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
const email_service_1 = require("../emails/email.service");
const METER_READING_KEYS = ['coldmeterwater', 'hotmeterwater', 'electricitymeter'];
let MeterReadingsService = class MeterReadingsService {
    constructor(firebaseAdminService, rateLimitService, auditLogService, emailService) {
        this.firebaseAdminService = firebaseAdminService;
        this.rateLimitService = rateLimitService;
        this.auditLogService = auditLogService;
        this.emailService = emailService;
    }
    assertAuthenticated(user) {
        if (!user?.uid || !user.role)
            throw new common_1.UnauthorizedException('Authentication required');
        if (!(0, role_constants_1.isPropertyMemberRole)(user.role) && !(0, role_constants_1.isStaffRole)(user.role)) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
    }
    requireStaffCompanyId(user) {
        if (user.companyId)
            return user.companyId;
        if (user.role === 'ManagementCompany')
            return user.uid;
        throw new common_1.ForbiddenException('Company scope is required');
    }
    assertStaffApartmentCompanyAccess(user, apartment) {
        const staffCompanyId = this.requireStaffCompanyId(user);
        const companyIds = Array.isArray(apartment.companyIds)
            ? apartment.companyIds.filter((x) => typeof x === 'string' && x.trim().length > 0)
            : [];
        const companyId = typeof apartment.companyId === 'string' ? apartment.companyId : '';
        if (!companyIds.includes(staffCompanyId) && companyId !== staffCompanyId) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
    }
    hasApartmentAccess(user, apartmentId, apartment) {
        const normalizedUserEmail = (0, invitation_token_1.normalizeEmail)(user.email ?? '');
        const ownerEmail = typeof apartment.ownerEmail === 'string' ? (0, invitation_token_1.normalizeEmail)(apartment.ownerEmail) : '';
        const isOwner = Boolean(normalizedUserEmail &&
            ownerEmail &&
            normalizedUserEmail === ownerEmail &&
            apartment.ownerActivated === true);
        const isPrimaryResident = typeof apartment.residentId === 'string' && apartment.residentId === user.uid;
        const isTenantActive = (tenant) => {
            const fromDate = typeof tenant.fromDate === 'string' ? new Date(tenant.fromDate) : null;
            const until = typeof tenant.until === 'string' ? new Date(tenant.until) : null;
            const now = new Date();
            if (fromDate && now < fromDate) {
                return false;
            }
            if (until && now > until) {
                return false;
            }
            return true;
        };
        const isTenantWithSubmit = Array.isArray(apartment.tenants) &&
            apartment.tenants.some((tenant) => {
                if (!tenant || typeof tenant !== 'object')
                    return false;
                const t = tenant;
                const userId = typeof t.userId === 'string' ? t.userId : '';
                const permissions = Array.isArray(t.permissions)
                    ? t.permissions.filter((p) => typeof p === 'string')
                    : [];
                return userId === user.uid && permissions.includes('submitMeter') && isTenantActive(t);
            });
        return isOwner || isPrimaryResident || isTenantWithSubmit;
    }
    historySubmittedAtTime(value) {
        if (value instanceof Date)
            return value.getTime();
        if (typeof value === 'string') {
            const parsed = new Date(value);
            return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
        }
        if (value && typeof value === 'object' && typeof value.toDate === 'function') {
            const parsed = value.toDate();
            return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
        }
        return 0;
    }
    async electricityAllowsMultipleMonthlySubmissions(apartment, payloadBuildingId) {
        const buildingId = typeof payloadBuildingId === 'string' && payloadBuildingId.trim()
            ? payloadBuildingId.trim()
            : typeof apartment.buildingId === 'string'
                ? apartment.buildingId.trim()
                : '';
        if (!buildingId)
            return false;
        const buildingSnap = await this.firebaseAdminService.firestore.collection('buildings').doc(buildingId).get();
        const building = buildingSnap.data();
        const readingConfig = building?.readingConfig && typeof building.readingConfig === 'object'
            ? building.readingConfig
            : {};
        return Boolean(readingConfig.electricityAllowMultipleMonthlySubmissions);
    }
    extractApartmentReadings(apartmentId, apartment, buildingInfo, user) {
        const wr = (apartment.waterReadings ?? {});
        const entries = [];
        const pickNumber = (...vals) => {
            for (const v of vals) {
                if (typeof v === 'string' && v.trim() !== '')
                    return v.trim();
                if (typeof v === 'number' && Number.isFinite(v))
                    return String(v);
            }
            return '';
        };
        const apartmentNumber = pickNumber(apartment.number, apartment.apartmentNumber, apartment.apartmentNo, apartment.no, apartment.flatNumber, apartment.readableId);
        const buildingId = typeof apartment.buildingId === 'string' ? apartment.buildingId : '';
        const buildingName = buildingInfo?.name ?? '';
        const buildingAddress = buildingInfo?.address ?? (typeof apartment.address === 'string' ? apartment.address : '');
        for (const key of METER_READING_KEYS) {
            const group = wr[key];
            if (!group || !Array.isArray(group.history))
                continue;
            const serialNumber = typeof group.serialNumber === 'string' ? group.serialNumber : '';
            let tenantFromDate = null;
            let tenantUntilDate = null;
            if (user) {
                const tenants = Array.isArray(apartment.tenants) ? apartment.tenants : [];
                const currentTenant = tenants.find((tenant) => {
                    if (!tenant || typeof tenant !== 'object')
                        return false;
                    const t = tenant;
                    return typeof t.userId === 'string' && t.userId === user.uid;
                });
                if (currentTenant) {
                    const t = currentTenant;
                    if (typeof t.fromDate === 'string')
                        tenantFromDate = new Date(t.fromDate);
                    if (typeof t.until === 'string')
                        tenantUntilDate = new Date(t.until);
                }
            }
            const meterHistory = [...group.history].sort((a, b) => {
                const yearDiff = Number(a.year ?? 0) - Number(b.year ?? 0);
                if (yearDiff !== 0)
                    return yearDiff;
                const monthDiff = Number(a.month ?? 0) - Number(b.month ?? 0);
                if (monthDiff !== 0)
                    return monthDiff;
                return this.historySubmittedAtTime(a.submittedAt) - this.historySubmittedAtTime(b.submittedAt);
            });
            for (const [entryIndex, item] of meterHistory.entries()) {
                let submittedAt;
                let submittedAtDate = null;
                if (item.submittedAt) {
                    if (item.submittedAt instanceof Date) {
                        submittedAtDate = item.submittedAt;
                        submittedAt = item.submittedAt.toISOString();
                    }
                    else if (typeof item.submittedAt === 'string') {
                        const parsed = new Date(item.submittedAt);
                        if (!Number.isNaN(parsed.getTime())) {
                            submittedAtDate = parsed;
                            submittedAt = parsed.toISOString();
                        }
                        else {
                            submittedAt = item.submittedAt;
                        }
                    }
                    else if (item.submittedAt && typeof item.submittedAt === 'object') {
                        const ts = item.submittedAt;
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
                    ...(entryIndex === 0 ? { previousValue: null, consumption: 0 } : {}),
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
    async getAccessibleApartmentIds(user) {
        const db = this.firebaseAdminService.firestore;
        const apartmentIds = new Set();
        const addApartmentId = (value) => {
            if (typeof value === 'string' && value.trim()) {
                apartmentIds.add(value.trim());
            }
        };
        addApartmentId(user.apartmentId);
        const userSnap = await db.collection('users').doc(user.uid).get();
        const userData = userSnap.exists ? userSnap.data() : {};
        addApartmentId(userData.apartmentId);
        if (Array.isArray(userData.apartmentIds)) {
            userData.apartmentIds.forEach(addApartmentId);
        }
        const normalizedEmail = (0, invitation_token_1.normalizeEmail)((typeof user.email === 'string' ? user.email : typeof userData.email === 'string' ? userData.email : '') ?? '');
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
            if (!snap)
                continue;
            for (const doc of snap.docs) {
                apartmentIds.add(doc.id);
            }
        }
        const candidateIds = Array.from(apartmentIds);
        if (!candidateIds.length)
            return [];
        const snaps = await db.getAll(...candidateIds.map((id) => db.collection('apartments').doc(id)));
        return snaps
            .filter((snap) => snap.exists)
            .filter((snap) => this.hasApartmentAccess(user, snap.id, snap.data()))
            .map((snap) => snap.id);
    }
    async list(user, apartmentId, companyId) {
        this.assertAuthenticated(user);
        const db = this.firebaseAdminService.firestore;
        if (apartmentId) {
            const snap = await db.collection('apartments').doc(apartmentId).get();
            if (!snap.exists)
                throw new common_1.NotFoundException('Apartment not found');
            const apartment = snap.data();
            if ((0, role_constants_1.isPropertyMemberRole)(user.role)) {
                if (!this.hasApartmentAccess(user, apartmentId, apartment)) {
                    throw new common_1.ForbiddenException('Access denied for apartment');
                }
            }
            else if ((0, role_constants_1.isStaffRole)(user.role)) {
                this.assertStaffApartmentCompanyAccess(user, apartment);
            }
            return { items: this.extractApartmentReadings(apartmentId, apartment, await this.loadBuildingInfo(apartment), user) };
        }
        if ((0, role_constants_1.isPropertyMemberRole)(user.role)) {
            const accessibleApartmentIds = await this.getAccessibleApartmentIds(user);
            if (!accessibleApartmentIds.length) {
                return { items: [] };
            }
            const apartmentSnaps = await db.getAll(...accessibleApartmentIds.map((id) => db.collection('apartments').doc(id)));
            const buildingIds = Array.from(new Set(apartmentSnaps
                .map((snap) => (snap.exists ? snap.data().buildingId : undefined))
                .filter((id) => typeof id === 'string' && id.trim().length > 0)));
            const buildingMap = await this.loadBuildings(buildingIds);
            const items = apartmentSnaps.flatMap((snap) => {
                if (!snap.exists)
                    return [];
                const apartment = snap.data();
                const buildingId = typeof apartment.buildingId === 'string' ? apartment.buildingId : '';
                return this.extractApartmentReadings(snap.id, apartment, buildingMap.get(buildingId), user);
            });
            return { items };
        }
        const staffCompanyId = this.requireStaffCompanyId(user);
        const effectiveCompanyId = companyId || staffCompanyId;
        if (effectiveCompanyId !== staffCompanyId) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        const snap = await db.collection('apartments').where('companyIds', 'array-contains', effectiveCompanyId).get();
        const buildingIds = Array.from(new Set(snap.docs
            .map((doc) => doc.data().buildingId)
            .filter((b) => typeof b === 'string' && b !== '')));
        const buildingMap = await this.loadBuildings(buildingIds);
        const items = snap.docs.flatMap((doc) => {
            const data = doc.data();
            const bId = typeof data.buildingId === 'string' ? data.buildingId : '';
            return this.extractApartmentReadings(doc.id, data, buildingMap.get(bId), (0, role_constants_1.isPropertyMemberRole)(user.role) ? user : undefined);
        });
        return { items };
    }
    electricityPaymentFromDoc(apartmentId, doc) {
        const data = doc.data();
        const dateValue = data.paidAt;
        const paidAt = dateValue instanceof Date
            ? dateValue.toISOString()
            : typeof dateValue === 'string'
                ? dateValue
                : typeof dateValue?.toDate === 'function'
                    ? dateValue.toDate().toISOString()
                    : '';
        return {
            id: doc.id,
            apartmentId,
            amount: Number(data.amount ?? 0) || 0,
            paidKwh: Number(data.paidKwh ?? 0) || 0,
            paidAt,
            note: typeof data.note === 'string' ? data.note : '',
            confirmed: data.confirmed !== false,
            confirmedBy: typeof data.confirmedBy === 'string' ? data.confirmedBy : '',
            createdAt: data.createdAt,
        };
    }
    async listElectricityPayments(user, query) {
        this.assertAuthenticated(user);
        const db = this.firebaseAdminService.firestore;
        let apartmentIds = [];
        if (query.apartmentId) {
            const snap = await db.collection('apartments').doc(query.apartmentId).get();
            if (!snap.exists)
                throw new common_1.NotFoundException('Apartment not found');
            const apartment = snap.data();
            if ((0, role_constants_1.isPropertyMemberRole)(user.role)) {
                if (!this.hasApartmentAccess(user, snap.id, apartment))
                    throw new common_1.ForbiddenException('Access denied for apartment');
            }
            else {
                this.assertStaffApartmentCompanyAccess(user, apartment);
            }
            apartmentIds = [snap.id];
        }
        else if ((0, role_constants_1.isPropertyMemberRole)(user.role)) {
            const accessibleIds = await this.getAccessibleApartmentIds(user);
            if (!accessibleIds.length)
                return { items: [] };
            const snaps = await db.getAll(...accessibleIds.map((id) => db.collection('apartments').doc(id)));
            apartmentIds = snaps
                .filter((snap) => snap.exists)
                .filter((snap) => !query.buildingId || snap.data().buildingId === query.buildingId)
                .map((snap) => snap.id);
        }
        else {
            const staffCompanyId = this.requireStaffCompanyId(user);
            const snap = await db.collection('apartments').where('companyIds', 'array-contains', staffCompanyId).get();
            apartmentIds = snap.docs
                .filter((doc) => !query.buildingId || doc.data().buildingId === query.buildingId)
                .map((doc) => doc.id);
        }
        if (!apartmentIds.length)
            return { items: [] };
        const batches = await Promise.all(apartmentIds.map(async (apartmentId) => {
            const snap = await db
                .collection('apartments')
                .doc(apartmentId)
                .collection('electricity_payments')
                .orderBy('paidAt', 'desc')
                .get();
            return snap.docs.map((doc) => this.electricityPaymentFromDoc(apartmentId, doc));
        }));
        return {
            items: batches
                .flat()
                .sort((left, right) => String(right.paidAt).localeCompare(String(left.paidAt))),
        };
    }
    async createElectricityPayment(request, user, payload) {
        this.assertAuthenticated(user);
        const apartmentId = typeof payload.apartmentId === 'string' ? payload.apartmentId.trim() : '';
        if (!apartmentId)
            throw new common_1.BadRequestException('apartmentId is required');
        const amount = Number(payload.amount ?? 0);
        if (!Number.isFinite(amount) || amount <= 0)
            throw new common_1.BadRequestException('amount must be positive');
        const paidKwh = Number(payload.paidKwh ?? 0);
        const paidAtRaw = typeof payload.paidAt === 'string' ? payload.paidAt : '';
        const paidAtDate = paidAtRaw ? new Date(paidAtRaw) : new Date();
        if (Number.isNaN(paidAtDate.getTime()))
            throw new common_1.BadRequestException('Invalid paidAt');
        const db = this.firebaseAdminService.firestore;
        const apartmentRef = db.collection('apartments').doc(apartmentId);
        const apartmentSnap = await apartmentRef.get();
        if (!apartmentSnap.exists)
            throw new common_1.NotFoundException('Apartment not found');
        const apartment = apartmentSnap.data();
        const staffSubmission = (0, role_constants_1.isStaffRole)(user.role);
        if (staffSubmission) {
            this.assertStaffApartmentCompanyAccess(user, apartment);
        }
        else if (!this.hasApartmentAccess(user, apartmentId, apartment)) {
            throw new common_1.ForbiddenException('Access denied for apartment');
        }
        const ref = apartmentRef.collection('electricity_payments').doc();
        const payment = {
            id: ref.id,
            apartmentId,
            amount: Number(amount.toFixed(2)),
            paidKwh: Number.isFinite(paidKwh) && paidKwh > 0 ? Number(paidKwh.toFixed(3)) : 0,
            paidAt: paidAtDate,
            note: typeof payload.note === 'string' ? payload.note.trim().slice(0, 500) : '',
            confirmed: staffSubmission,
            confirmedBy: staffSubmission ? user.uid : '',
            companyId: typeof apartment.companyId === 'string' ? apartment.companyId : user.companyId ?? '',
            createdAt: new Date(),
        };
        await ref.set(payment);
        void this.auditLogService.write({
            request,
            action: staffSubmission ? 'meter_reading.electricity_payment.confirm' : 'meter_reading.electricity_payment.request',
            status: 'success',
            actorUid: user.uid,
            actorRole: user.role,
            companyId: user.companyId,
            apartmentId,
            metadata: { amount: payment.amount, paidKwh: payment.paidKwh },
        });
        return { success: true, payment: { ...payment, paidAt: payment.paidAt.toISOString() } };
    }
    async confirmElectricityPayment(request, user, paymentId, payload) {
        this.assertAuthenticated(user);
        if (!(0, role_constants_1.isStaffRole)(user.role))
            throw new common_1.ForbiddenException('Only staff can confirm electricity payments');
        const apartmentId = typeof payload.apartmentId === 'string' ? payload.apartmentId.trim() : '';
        if (!apartmentId || !paymentId)
            throw new common_1.BadRequestException('apartmentId and paymentId are required');
        const db = this.firebaseAdminService.firestore;
        const apartmentRef = db.collection('apartments').doc(apartmentId);
        const apartmentSnap = await apartmentRef.get();
        if (!apartmentSnap.exists)
            throw new common_1.NotFoundException('Apartment not found');
        const apartment = apartmentSnap.data();
        this.assertStaffApartmentCompanyAccess(user, apartment);
        const paymentRef = apartmentRef.collection('electricity_payments').doc(paymentId);
        const paymentSnap = await paymentRef.get();
        if (!paymentSnap.exists)
            throw new common_1.NotFoundException('Electricity payment not found');
        await paymentRef.set({
            confirmed: true,
            confirmedBy: user.uid,
            confirmedAt: new Date(),
        }, { merge: true });
        void this.auditLogService.write({
            request,
            action: 'meter_reading.electricity_payment.confirm',
            status: 'success',
            actorUid: user.uid,
            actorRole: user.role,
            companyId: user.companyId,
            apartmentId,
            metadata: { paymentId },
        });
        return { success: true };
    }
    async removeElectricityPayment(request, user, paymentId, apartmentId) {
        this.assertAuthenticated(user);
        if (!(0, role_constants_1.isStaffRole)(user.role))
            throw new common_1.ForbiddenException('Only staff can delete electricity payments');
        if (!apartmentId || !paymentId)
            throw new common_1.BadRequestException('apartmentId and paymentId are required');
        const db = this.firebaseAdminService.firestore;
        const apartmentRef = db.collection('apartments').doc(apartmentId);
        const apartmentSnap = await apartmentRef.get();
        if (!apartmentSnap.exists)
            throw new common_1.NotFoundException('Apartment not found');
        const apartment = apartmentSnap.data();
        this.assertStaffApartmentCompanyAccess(user, apartment);
        const paymentRef = apartmentRef.collection('electricity_payments').doc(paymentId);
        const paymentSnap = await paymentRef.get();
        if (!paymentSnap.exists)
            throw new common_1.NotFoundException('Electricity payment not found');
        await paymentRef.delete();
        void this.auditLogService.write({
            request,
            action: 'meter_reading.electricity_payment.delete',
            status: 'success',
            actorUid: user.uid,
            actorRole: user.role,
            companyId: user.companyId,
            apartmentId,
            metadata: { paymentId },
        });
        return { success: true };
    }
    async loadBuildingInfo(apartment) {
        const buildingId = typeof apartment.buildingId === 'string' ? apartment.buildingId : '';
        if (!buildingId)
            return undefined;
        const map = await this.loadBuildings([buildingId]);
        return map.get(buildingId);
    }
    async loadBuildings(buildingIds) {
        const map = new Map();
        if (buildingIds.length === 0)
            return map;
        const db = this.firebaseAdminService.firestore;
        const snaps = await Promise.all(buildingIds.map((id) => db.collection('buildings').doc(id).get()));
        for (const s of snaps) {
            if (!s.exists)
                continue;
            const d = s.data();
            map.set(s.id, {
                name: typeof d.name === 'string' ? d.name : typeof d.title === 'string' ? d.title : undefined,
                address: typeof d.address === 'string'
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
        if ((0, role_constants_1.isPropertyMemberRole)(user.role)) {
            if (!this.hasApartmentAccess(user, apartmentId, apartment)) {
                throw new common_1.ForbiddenException('Access denied for apartment');
            }
        }
        else if ((0, role_constants_1.isStaffRole)(user.role)) {
            this.assertStaffApartmentCompanyAccess(user, apartment);
        }
        const now = new Date();
        const month = typeof payload.month === 'number' ? payload.month : now.getMonth() + 1;
        const year = typeof payload.year === 'number' ? payload.year : now.getFullYear();
        const submittedAt = month !== now.getMonth() + 1 || year !== now.getFullYear()
            ? new Date(year, month, 0, 12, 0, 0)
            : now;
        const previousValue = Number(payload.previousValue ?? 0);
        const currentValue = Number(payload.currentValue ?? 0);
        const consumption = Number.isFinite(currentValue) && Number.isFinite(previousValue)
            ? Number(Math.max(0, currentValue - previousValue).toFixed(3))
            : 0;
        const reading = {
            id: (0, node_crypto_1.randomUUID)(),
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
        const wr = (apartment.waterReadings ?? {});
        const namedKey = METER_READING_KEYS.find((k) => wr[k]?.meterId === meterId);
        const preferredKey = METER_READING_KEYS.includes(payload.meterKey)
            ? payload.meterKey
            : undefined;
        const key = namedKey ?? preferredKey ?? 'coldmeterwater';
        const meterGroup = wr[key] ?? { meterId, history: [] };
        const history = Array.isArray(meterGroup.history) ? [...meterGroup.history] : [];
        const allowMultipleMonthlyElectricityReadings = key === 'electricitymeter'
            ? await this.electricityAllowsMultipleMonthlySubmissions(apartment, payload.buildingId)
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
                return this.historySubmittedAtTime(b.submittedAt) - this.historySubmittedAtTime(a.submittedAt);
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
        if ((0, role_constants_1.isPropertyMemberRole)(user.role)) {
            if (!this.hasApartmentAccess(user, apartmentId, apartment)) {
                throw new common_1.ForbiddenException('Access denied for apartment');
            }
        }
        else if ((0, role_constants_1.isStaffRole)(user.role)) {
            this.assertStaffApartmentCompanyAccess(user, apartment);
        }
        const wr = (apartment.waterReadings ?? {});
        let foundKey = null;
        let foundGroup = null;
        let foundIndex = -1;
        for (const key of METER_READING_KEYS) {
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
            ? await this.electricityAllowsMultipleMonthlySubmissions(apartment)
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
        if ((0, role_constants_1.isPropertyMemberRole)(user.role)) {
            if (!this.hasApartmentAccess(user, apartmentId, apartment)) {
                throw new common_1.ForbiddenException('Access denied for apartment');
            }
        }
        else if ((0, role_constants_1.isStaffRole)(user.role)) {
            this.assertStaffApartmentCompanyAccess(user, apartment);
        }
        const wr = (apartment.waterReadings ?? {});
        let foundKey = null;
        let foundGroup = null;
        let foundEntry = null;
        for (const key of METER_READING_KEYS) {
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
            ? await this.electricityAllowsMultipleMonthlySubmissions(apartment)
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
    async sendTestReminder(user) {
        this.assertAuthenticated(user);
        const db = this.firebaseAdminService.firestore;
        const companyEmail = user.email;
        if (!companyEmail) {
            throw new common_1.BadRequestException('Company email not found');
        }
        const companyId = user.companyId || '';
        if (!companyId) {
            throw new common_1.BadRequestException('Company ID not found for this user');
        }
        const [snap1, snap2] = await Promise.all([
            db.collection('buildings').where('companyId', '==', companyId).limit(1).get(),
            db.collection('buildings').where('managedBy.companyId', '==', companyId).limit(1).get(),
        ]);
        const buildingsSnapshot = !snap1.empty ? snap1 : snap2;
        if (buildingsSnapshot.empty) {
            throw new common_1.NotFoundException('No buildings found for this company');
        }
        const building = buildingsSnapshot.docs[0].data();
        const buildingName = building.name || building.address || 'Test Building';
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
};
exports.MeterReadingsService = MeterReadingsService;
exports.MeterReadingsService = MeterReadingsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        rate_limit_service_1.RateLimitService,
        audit_log_service_1.AuditLogService,
        email_service_1.EmailService])
], MeterReadingsService);
