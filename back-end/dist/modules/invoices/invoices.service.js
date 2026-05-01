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
exports.InvoicesService = void 0;
const common_1 = require("@nestjs/common");
const role_constants_1 = require("../../common/auth/role.constants");
const firebase_admin_service_1 = require("../../common/infrastructure/firebase/firebase-admin.service");
const rate_limit_service_1 = require("../../common/services/rate-limit.service");
const audit_log_service_1 = require("../../common/services/audit-log.service");
const invitation_token_1 = require("../../common/utils/invitation-token");
let InvoicesService = class InvoicesService {
    constructor(firebaseAdminService, rateLimitService, auditLogService) {
        this.firebaseAdminService = firebaseAdminService;
        this.rateLimitService = rateLimitService;
        this.auditLogService = auditLogService;
    }
    assertAuthenticated(user) {
        if (!user?.uid || !user.role)
            throw new common_1.UnauthorizedException('Authentication required');
    }
    isStaff(user) {
        return (0, role_constants_1.isStaffRole)(user.role);
    }
    async getAccessibleApartmentIds(user) {
        const apartmentIds = new Set();
        if (typeof user.apartmentId === 'string' && user.apartmentId.trim()) {
            apartmentIds.add(user.apartmentId.trim());
        }
        const userSnap = await this.firebaseAdminService.firestore.collection('users').doc(user.uid).get();
        const userData = userSnap.exists ? userSnap.data() : {};
        const addApartmentId = (value) => {
            if (typeof value === 'string' && value.trim()) {
                apartmentIds.add(value.trim());
            }
        };
        addApartmentId(userData.apartmentId);
        if (Array.isArray(userData.apartmentIds)) {
            for (const apartmentId of userData.apartmentIds) {
                addApartmentId(apartmentId);
            }
        }
        const normalizedEmail = (0, invitation_token_1.normalizeEmail)((typeof user.email === 'string' ? user.email : typeof userData.email === 'string' ? userData.email : '') ?? '');
        if (normalizedEmail) {
            const [residentSnap, ownerSnap] = await Promise.all([
                this.firebaseAdminService.firestore.collection('apartments').where('residentId', '==', user.uid).get(),
                this.firebaseAdminService.firestore.collection('apartments').where('ownerEmail', '==', normalizedEmail).get(),
            ]);
            for (const doc of [...residentSnap.docs, ...ownerSnap.docs]) {
                apartmentIds.add(doc.id);
            }
        }
        const tenantSnap = await this.firebaseAdminService.firestore.collection('apartments').get();
        for (const doc of tenantSnap.docs) {
            const apartment = doc.data();
            const tenants = Array.isArray(apartment.tenants) ? apartment.tenants : [];
            const isTenant = tenants.some((tenant) => {
                if (!tenant || typeof tenant !== 'object')
                    return false;
                return typeof tenant.userId === 'string'
                    && tenant.userId === user.uid;
            });
            if (isTenant) {
                apartmentIds.add(doc.id);
            }
        }
        return Array.from(apartmentIds);
    }
    async create(request, user, payload) {
        this.assertAuthenticated(user);
        if (!this.isStaff(user)) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
        const apartmentId = typeof payload.apartmentId === 'string' ? payload.apartmentId.trim() : '';
        const amount = Number(payload.amount);
        if (!apartmentId || !Number.isFinite(amount)) {
            throw new common_1.BadRequestException('Invalid invoice payload');
        }
        const rl = await this.rateLimitService.consume(this.rateLimitService.buildKey(request, 'invoice:create', user.uid), 20, 60_000);
        if (!rl.allowed)
            throw new common_1.BadRequestException('Too many requests');
        const db = this.firebaseAdminService.firestore;
        const apartmentSnap = await db.collection('apartments').doc(apartmentId).get();
        if (!apartmentSnap.exists)
            throw new common_1.NotFoundException('Apartment not found');
        const apartmentData = apartmentSnap.data();
        const apartmentCompanyIds = Array.isArray(apartmentData.companyIds)
            ? apartmentData.companyIds.filter((x) => typeof x === 'string')
            : [];
        const payloadCompanyId = typeof payload.companyId === 'string' ? payload.companyId : undefined;
        if (user.companyId && payloadCompanyId && payloadCompanyId !== user.companyId) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        const targetCompanyId = payloadCompanyId ?? user.companyId ?? apartmentCompanyIds[0];
        if (!targetCompanyId || !apartmentCompanyIds.includes(targetCompanyId)) {
            throw new common_1.ForbiddenException('Access denied for apartment/company ownership');
        }
        const ref = db.collection('invoices').doc();
        const data = {
            apartmentId,
            month: Number(payload.month),
            year: Number(payload.year),
            amount,
            status: payload.status === 'pending' || payload.status === 'paid' || payload.status === 'overdue'
                ? payload.status
                : 'pending',
            pdfUrl: typeof payload.pdfUrl === 'string' ? payload.pdfUrl : '',
            companyId: targetCompanyId,
            buildingId: typeof payload.buildingId === 'string' ? payload.buildingId : null,
            createdAt: new Date(),
            createdByUid: user.uid,
        };
        await ref.set(data);
        void this.auditLogService.write({
            request,
            action: 'invoice.create',
            status: 'success',
            actorUid: user.uid,
            actorRole: user.role,
            companyId: targetCompanyId,
            apartmentId,
            metadata: { invoiceId: ref.id },
        });
        return { success: true, invoice: { id: ref.id, ...data } };
    }
    async list(user, query) {
        this.assertAuthenticated(user);
        const db = this.firebaseAdminService.firestore;
        if (this.isStaff(user)) {
            let q = db.collection('invoices');
            const companyId = query.companyId ?? user.companyId;
            if (companyId)
                q = q.where('companyId', '==', companyId);
            if (query.apartmentId)
                q = q.where('apartmentId', '==', query.apartmentId);
            if (query.buildingId)
                q = q.where('buildingId', '==', query.buildingId);
            const snapshot = await q.get();
            const items = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            }));
            if (user.companyId) {
                return {
                    items: items.filter((item) => (typeof item.companyId === 'string' ? item.companyId : null) === user.companyId),
                    query,
                };
            }
            return { items, query };
        }
        if (!(0, role_constants_1.isPropertyMemberRole)(user.role)) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
        const accessibleApartmentIds = await this.getAccessibleApartmentIds(user);
        if (!accessibleApartmentIds.length) {
            return { items: [], query };
        }
        const requestedApartmentId = typeof query.apartmentId === 'string' ? query.apartmentId.trim() : '';
        if (requestedApartmentId && !accessibleApartmentIds.includes(requestedApartmentId)) {
            throw new common_1.ForbiddenException('Access denied for apartment');
        }
        const apartmentIdsToLoad = requestedApartmentId ? [requestedApartmentId] : accessibleApartmentIds;
        const chunks = [];
        for (let index = 0; index < apartmentIdsToLoad.length; index += 10) {
            chunks.push(apartmentIdsToLoad.slice(index, index + 10));
        }
        const snapshots = await Promise.all(chunks.map((chunk) => db.collection('invoices').where('apartmentId', 'in', chunk).get()));
        const items = snapshots.flatMap((snapshot) => snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        return { items, query };
    }
    async byId(user, invoiceId) {
        this.assertAuthenticated(user);
        const snap = await this.firebaseAdminService.firestore.collection('invoices').doc(invoiceId).get();
        if (!snap.exists)
            throw new common_1.NotFoundException('Invoice not found');
        const data = snap.data();
        const targetCompanyId = typeof data.companyId === 'string' ? data.companyId : undefined;
        const apartmentId = typeof data.apartmentId === 'string' ? data.apartmentId : undefined;
        if (this.isStaff(user)) {
            if (user.companyId && targetCompanyId && user.companyId !== targetCompanyId) {
                throw new common_1.ForbiddenException('Access denied for company');
            }
        }
        else {
            if (!(0, role_constants_1.isPropertyMemberRole)(user.role)) {
                throw new common_1.ForbiddenException('Insufficient permissions');
            }
            const accessibleApartmentIds = await this.getAccessibleApartmentIds(user);
            if (!apartmentId || !accessibleApartmentIds.includes(apartmentId)) {
                throw new common_1.ForbiddenException('Access denied for apartment');
            }
        }
        return { id: snap.id, ...data };
    }
    async update(request, user, invoiceId, payload) {
        this.assertAuthenticated(user);
        if (!this.isStaff(user)) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
        const rl = await this.rateLimitService.consume(this.rateLimitService.buildKey(request, 'invoice:update', invoiceId), 30, 60_000);
        if (!rl.allowed)
            throw new common_1.BadRequestException('Too many requests');
        const db = this.firebaseAdminService.firestore;
        const ref = db.collection('invoices').doc(invoiceId);
        const snap = await ref.get();
        if (!snap.exists)
            throw new common_1.NotFoundException('Invoice not found');
        const current = snap.data();
        const targetCompanyId = typeof current.companyId === 'string' ? current.companyId : undefined;
        if (user.companyId && targetCompanyId && user.companyId !== targetCompanyId) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        await ref.set(payload, { merge: true });
        void this.auditLogService.write({
            request,
            action: typeof payload.pdfUrl === 'string' && payload.pdfUrl !== current.pdfUrl
                ? 'invoice.file_attach'
                : 'invoice.update',
            status: 'success',
            actorUid: user.uid,
            actorRole: user.role,
            companyId: targetCompanyId,
            apartmentId: typeof current.apartmentId === 'string' ? current.apartmentId : undefined,
            metadata: { invoiceId },
        });
        return { success: true };
    }
    async remove(request, user, invoiceId) {
        this.assertAuthenticated(user);
        if (!this.isStaff(user)) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
        const rl = await this.rateLimitService.consume(this.rateLimitService.buildKey(request, 'invoice:delete', invoiceId), 20, 60_000);
        if (!rl.allowed)
            throw new common_1.BadRequestException('Too many requests');
        const db = this.firebaseAdminService.firestore;
        const ref = db.collection('invoices').doc(invoiceId);
        const snap = await ref.get();
        if (!snap.exists)
            throw new common_1.NotFoundException('Invoice not found');
        const current = snap.data();
        const targetCompanyId = typeof current.companyId === 'string' ? current.companyId : undefined;
        if (user.companyId && targetCompanyId && user.companyId !== targetCompanyId) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        await ref.delete();
        void this.auditLogService.write({
            request,
            action: 'invoice.delete',
            status: 'success',
            actorUid: user.uid,
            actorRole: user.role,
            companyId: targetCompanyId,
            apartmentId: typeof current.apartmentId === 'string' ? current.apartmentId : undefined,
            metadata: {
                invoiceId,
                hadPdf: typeof current.pdfUrl === 'string' && current.pdfUrl.length > 0,
            },
        });
        return { success: true };
    }
};
exports.InvoicesService = InvoicesService;
exports.InvoicesService = InvoicesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        rate_limit_service_1.RateLimitService,
        audit_log_service_1.AuditLogService])
], InvoicesService);
