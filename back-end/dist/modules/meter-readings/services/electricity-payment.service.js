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
exports.ElectricityPaymentService = void 0;
const common_1 = require("@nestjs/common");
const role_constants_1 = require("../../../common/auth/role.constants");
const firebase_admin_service_1 = require("../../../common/infrastructure/firebase/firebase-admin.service");
const audit_log_service_1 = require("../../../common/services/audit-log.service");
const meter_reading_access_service_1 = require("./meter-reading-access.service");
let ElectricityPaymentService = class ElectricityPaymentService {
    constructor(firebaseAdminService, auditLogService, accessService) {
        this.firebaseAdminService = firebaseAdminService;
        this.auditLogService = auditLogService;
        this.accessService = accessService;
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
    async list(user, query) {
        this.accessService.assertAuthenticated(user);
        const db = this.firebaseAdminService.firestore;
        let apartmentIds = [];
        if (query.apartmentId) {
            const snap = await db.collection('apartments').doc(query.apartmentId).get();
            if (!snap.exists)
                throw new common_1.NotFoundException('Apartment not found');
            const apartment = snap.data();
            if ((0, role_constants_1.isPropertyMemberRole)(user.role)) {
                if (!this.accessService.hasApartmentAccess(user, snap.id, apartment))
                    throw new common_1.ForbiddenException('Access denied for apartment');
            }
            else {
                this.accessService.assertStaffApartmentCompanyAccess(user, apartment);
            }
            apartmentIds = [snap.id];
        }
        else if ((0, role_constants_1.isPropertyMemberRole)(user.role)) {
            const accessibleIds = await this.accessService.getAccessibleApartmentIds(user);
            if (!accessibleIds.length)
                return { items: [] };
            const snaps = await db.getAll(...accessibleIds.map((id) => db.collection('apartments').doc(id)));
            apartmentIds = snaps
                .filter((snap) => snap.exists)
                .filter((snap) => !query.buildingId || snap.data().buildingId === query.buildingId)
                .map((snap) => snap.id);
        }
        else {
            const staffCompanyId = this.accessService.requireStaffCompanyId(user);
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
    async create(request, user, payload) {
        this.accessService.assertAuthenticated(user);
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
            this.accessService.assertStaffApartmentCompanyAccess(user, apartment);
        }
        else if (!this.accessService.hasApartmentAccess(user, apartmentId, apartment)) {
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
    async confirm(request, user, paymentId, payload) {
        this.accessService.assertAuthenticated(user);
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
        this.accessService.assertStaffApartmentCompanyAccess(user, apartment);
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
    async remove(request, user, paymentId, apartmentId) {
        this.accessService.assertAuthenticated(user);
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
        this.accessService.assertStaffApartmentCompanyAccess(user, apartment);
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
};
exports.ElectricityPaymentService = ElectricityPaymentService;
exports.ElectricityPaymentService = ElectricityPaymentService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        audit_log_service_1.AuditLogService,
        meter_reading_access_service_1.MeterReadingAccessService])
], ElectricityPaymentService);
