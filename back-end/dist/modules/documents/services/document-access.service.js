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
exports.DocumentAccessService = void 0;
const common_1 = require("@nestjs/common");
const role_constants_1 = require("../../../common/auth/role.constants");
const firebase_admin_service_1 = require("../../../common/infrastructure/firebase/firebase-admin.service");
const document_helper_service_1 = require("./document-helper.service");
let DocumentAccessService = class DocumentAccessService {
    constructor(firebaseAdminService, helperService) {
        this.firebaseAdminService = firebaseAdminService;
        this.helperService = helperService;
    }
    assertAuthenticated(user) {
        if (!user?.uid || !user.role)
            throw new common_1.UnauthorizedException('Authentication required');
    }
    requireStaffCompanyId(user) {
        const companyId = this.helperService.firstString(user.companyId);
        if (!companyId)
            throw new common_1.ForbiddenException('Company scope is required');
        return companyId;
    }
    isApartmentMember(apartment, user) {
        const ownerEmail = this.helperService.firstString(apartment.ownerEmail).toLowerCase();
        const userEmail = this.helperService.firstString(user.email).toLowerCase();
        const tenants = Array.isArray(apartment.tenants) ? apartment.tenants : [];
        const isTenantActive = (tenant) => {
            const fromDate = typeof tenant.fromDate === 'string' ? new Date(tenant.fromDate) : null;
            const until = typeof tenant.until === 'string' ? new Date(tenant.until) : null;
            const now = new Date();
            if (fromDate && now < fromDate)
                return false;
            if (until && now > until)
                return false;
            return true;
        };
        return (this.helperService.firstString(apartment.residentId) === user.uid ||
            this.helperService.firstString(apartment.ownerId) === user.uid ||
            Boolean(userEmail && ownerEmail && ownerEmail === userEmail && apartment.ownerActivated === true) ||
            tenants.some((tenant) => {
                if (!tenant || typeof tenant !== 'object')
                    return false;
                const record = tenant;
                const hasMatch = this.helperService.firstString(record.userId) === user.uid ||
                    this.helperService.firstString(record.email).toLowerCase() === userEmail;
                return hasMatch && isTenantActive(record);
            }));
    }
    memberAccessForApartment(apartment, user) {
        const ownerEmail = this.helperService.firstString(apartment.ownerEmail).toLowerCase();
        const userEmail = this.helperService.firstString(user.email).toLowerCase();
        if (this.helperService.firstString(apartment.residentId) === user.uid)
            return { type: 'resident' };
        if (this.helperService.firstString(apartment.ownerId) === user.uid)
            return { type: 'owner' };
        if (userEmail && ownerEmail && ownerEmail === userEmail && apartment.ownerActivated === true)
            return { type: 'owner' };
        const tenants = Array.isArray(apartment.tenants) ? apartment.tenants : [];
        for (const tenant of tenants) {
            if (!tenant || typeof tenant !== 'object')
                continue;
            const record = tenant;
            const tenantEmail = this.helperService.firstString(record.email).toLowerCase();
            const matches = this.helperService.firstString(record.userId) === user.uid || Boolean(userEmail && tenantEmail === userEmail);
            if (!matches)
                continue;
            return {
                type: 'tenant',
                fromDate: this.helperService.parseOptionalDate(record.fromDate),
                until: this.helperService.parseOptionalDate(record.until),
                canViewDocuments: Array.isArray(record.permissions) &&
                    record.permissions.some((permission) => ['viewDocuments', 'documents'].includes(this.helperService.firstString(permission))),
            };
        }
        return null;
    }
    documentVisibleForApartmentAccess(user, apartment, document) {
        if (this.helperService.firstString(document.ownerUserId) === user.uid)
            return true;
        const access = this.memberAccessForApartment(apartment.data, user);
        if (!access)
            return false;
        if (access.type !== 'tenant')
            return true;
        return access.canViewDocuments === true;
    }
    async resolveMemberApartments(user) {
        const db = this.firebaseAdminService.firestore;
        const apartmentMap = new Map();
        const userEmail = this.helperService.firstString(user.email).toLowerCase();
        const userSnap = await db.collection('users').doc(user.uid).get();
        const userData = userSnap.exists ? userSnap.data() : {};
        const apartmentIds = new Set();
        const addApartmentId = (value) => {
            const apartmentId = this.helperService.firstString(value);
            if (apartmentId)
                apartmentIds.add(apartmentId);
        };
        addApartmentId(user.apartmentId);
        addApartmentId(userData.apartmentId);
        if (Array.isArray(userData.apartmentIds)) {
            userData.apartmentIds.forEach(addApartmentId);
        }
        const addSnap = (snap) => {
            for (const doc of snap.docs)
                apartmentMap.set(doc.id, doc.data());
        };
        const apartmentRefs = Array.from(apartmentIds).map((id) => db.collection('apartments').doc(id));
        const directSnaps = apartmentRefs.length > 0 ? await db.getAll(...apartmentRefs) : [];
        for (const snap of directSnaps) {
            if (snap.exists)
                apartmentMap.set(snap.id, snap.data());
        }
        await Promise.all([
            db.collection('apartments').where('residentId', '==', user.uid).get().then(addSnap),
            db.collection('apartments').where('ownerId', '==', user.uid).get().then(addSnap),
            userEmail ? db.collection('apartments').where('ownerEmail', '==', userEmail).get().then(addSnap) : Promise.resolve(),
        ]);
        return Array.from(apartmentMap.entries()).map(([id, data]) => ({ id, data }));
    }
    async canAccessDocument(user, document, memberApartments) {
        const scope = this.helperService.firstString(document.scope);
        if (this.helperService.firstString(document.ownerUserId) === user.uid)
            return true;
        if (scope === 'platformPrivate')
            return false;
        if ((0, role_constants_1.isPlatformAdminRole)(user.role))
            return true;
        if (scope === 'privateApartment') {
            return this.helperService.firstString(document.ownerUserId) === user.uid;
        }
        if (scope === 'apartmentPrivate') {
            if ((0, role_constants_1.isStaffRole)(user.role) || !(0, role_constants_1.isPropertyMemberRole)(user.role))
                return false;
            const apartmentId = this.helperService.firstString(document.apartmentId);
            const apartments = memberApartments ?? await this.resolveMemberApartments(user);
            return apartments.some((apartment) => apartment.id === apartmentId && this.documentVisibleForApartmentAccess(user, apartment, document));
        }
        if ((0, role_constants_1.isStaffRole)(user.role)) {
            const companyId = this.helperService.firstString(document.companyId);
            return Boolean(companyId && this.requireStaffCompanyId(user) === companyId);
        }
        if (!(0, role_constants_1.isPropertyMemberRole)(user.role))
            return false;
        if (scope === 'managementArchive')
            return false;
        const apartments = memberApartments ?? await this.resolveMemberApartments(user);
        if (scope === 'apartmentResidents') {
            const apartmentId = this.helperService.firstString(document.apartmentId);
            return apartments.some((apartment) => apartment.id === apartmentId && this.documentVisibleForApartmentAccess(user, apartment, document));
        }
        const buildingId = this.helperService.firstString(document.buildingId);
        return apartments.some((apartment) => this.helperService.firstString(apartment.data.buildingId) === buildingId &&
            this.documentVisibleForApartmentAccess(user, apartment, document));
    }
};
exports.DocumentAccessService = DocumentAccessService;
exports.DocumentAccessService = DocumentAccessService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        document_helper_service_1.DocumentHelperService])
], DocumentAccessService);
