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
exports.MeterReadingAccessService = void 0;
const common_1 = require("@nestjs/common");
const role_constants_1 = require("../../../common/auth/role.constants");
const firebase_admin_service_1 = require("../../../common/infrastructure/firebase/firebase-admin.service");
const invitation_token_1 = require("../../../common/utils/invitation-token");
const company_payload_service_1 = require("../../company/services/company-payload.service");
let MeterReadingAccessService = class MeterReadingAccessService {
    constructor(firebaseAdminService, companyPayloadService) {
        this.firebaseAdminService = firebaseAdminService;
        this.companyPayloadService = companyPayloadService;
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
    async assertCanManageStaffMeterReadings(user, apartment) {
        this.assertStaffApartmentCompanyAccess(user, apartment);
        if (user.role === 'ManagementCompany')
            return;
        if (user.role !== 'Accountant') {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
        const companyId = this.requireStaffCompanyId(user);
        const companySnap = await this.firebaseAdminService.firestore.collection('companies').doc(companyId).get();
        if (!companySnap.exists) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        const permissions = this.companyPayloadService.getCompanyMemberPermissions(companySnap.data(), user.uid);
        if (!permissions.manageMeterReadings && !permissions.manageMeterReadingData) {
            throw new common_1.ForbiddenException('You do not have permission to edit meter readings');
        }
    }
    hasApartmentAccess(user, apartmentId, apartment) {
        void apartmentId;
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
            if (fromDate && now < fromDate)
                return false;
            if (until && now > until)
                return false;
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
};
exports.MeterReadingAccessService = MeterReadingAccessService;
exports.MeterReadingAccessService = MeterReadingAccessService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        company_payload_service_1.CompanyPayloadService])
], MeterReadingAccessService);
