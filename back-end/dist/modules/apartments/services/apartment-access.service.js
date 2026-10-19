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
exports.ApartmentAccessService = void 0;
const common_1 = require("@nestjs/common");
const role_constants_1 = require("../../../common/auth/role.constants");
const firebase_admin_service_1 = require("../../../common/infrastructure/firebase/firebase-admin.service");
const invitation_token_1 = require("../../../common/utils/invitation-token");
const apartment_members_1 = require("../../../common/utils/apartment-members");
const values_1 = require("../../../common/utils/values");
let ApartmentAccessService = class ApartmentAccessService {
    constructor(firebaseAdminService) {
        this.firebaseAdminService = firebaseAdminService;
    }
    assertAuthenticated(user) {
        if (!user?.uid || !user.role) {
            throw new common_1.UnauthorizedException('Authentication required');
        }
    }
    assertManagementCompanyMutation(user) {
        if (user.role !== 'ManagementCompany') {
            throw new common_1.ForbiddenException('Only management company users can change apartments and residents');
        }
    }
    isStaff(user) {
        return (0, role_constants_1.isStaffRole)(user.role);
    }
    isPropertyMember(user) {
        return (0, role_constants_1.isPropertyMemberRole)(user.role);
    }
    effectiveStaffCompanyId(user) {
        const companyId = typeof user.companyId === 'string' && user.companyId.trim() ? user.companyId.trim() : '';
        if (companyId)
            return companyId;
        if (user.role === 'ManagementCompany')
            return user.uid;
        throw new common_1.ForbiddenException('Company scope is required');
    }
    apartmentBelongsToStaffCompany(user, apartment) {
        const scopedCompanyId = this.effectiveStaffCompanyId(user);
        const companyIds = Array.isArray(apartment.companyIds)
            ? apartment.companyIds.filter((x) => typeof x === 'string' && x.trim().length > 0)
            : [];
        const companyId = typeof apartment.companyId === 'string' ? apartment.companyId : undefined;
        return companyIds.includes(scopedCompanyId) || companyId === scopedCompanyId;
    }
    assertApartmentCompanyAccess(user, apartment) {
        if (!this.apartmentBelongsToStaffCompany(user, apartment)) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
    }
    async assertApartmentBuildingEditableForStaff(user, apartment) {
        if (!this.isStaff(user))
            return;
        const buildingId = (0, values_1.firstString)(apartment.buildingId, apartment.houseId);
        if (!buildingId)
            return;
        const buildingSnap = await this.firebaseAdminService.firestore.collection('buildings').doc(buildingId).get();
        if (!buildingSnap.exists)
            return;
        const building = buildingSnap.data();
        const buildingCompanyId = (typeof building.companyId === 'string' ? building.companyId.trim() : '') ||
            building.managedBy?.companyId?.trim() ||
            '';
        if (user.companyId && buildingCompanyId && user.companyId !== buildingCompanyId) {
            return;
        }
        if (building.editLocked === true) {
            throw new common_1.ForbiddenException('This building is locked by the platform administrator');
        }
    }
    async getAccessibleApartmentIds(user) {
        const candidates = await (0, apartment_members_1.findCandidateApartments)(this.firebaseAdminService.firestore, user);
        const normalizedUserEmail = (0, invitation_token_1.normalizeEmail)(user.email ?? '');
        return Array.from(candidates.entries())
            .filter(([, apartment]) => {
            const ownerId = typeof apartment.ownerId === 'string' ? apartment.ownerId : '';
            const ownerEmail = typeof apartment.ownerEmail === 'string' ? (0, invitation_token_1.normalizeEmail)(apartment.ownerEmail) : '';
            const isResident = false;
            const isOwner = apartment.ownerActivated === true &&
                ((ownerId && ownerId === user.uid) || Boolean(normalizedUserEmail && ownerEmail === normalizedUserEmail));
            const tenants = Array.isArray(apartment.tenants) ? apartment.tenants : [];
            const isTenant = tenants.some((tenant) => {
                if (!tenant || typeof tenant !== 'object')
                    return false;
                const record = tenant;
                const status = typeof record.status === 'string' ? record.status.trim().toLowerCase() : '';
                if (['removed', 'deleted', 'revoked', 'inactive', 'pending'].includes(status))
                    return false;
                if (record.activated !== true && !record.acceptedAt && !record.activatedAt && !['active', 'accepted'].includes(status))
                    return false;
                const now = new Date();
                const fromDate = typeof record.fromDate === 'string' ? new Date(record.fromDate) : null;
                const until = typeof record.until === 'string' ? new Date(record.until) : null;
                if (fromDate && now < fromDate)
                    return false;
                if (until && now > until)
                    return false;
                const tenantUserId = typeof record.userId === 'string' ? record.userId.trim() : '';
                const tenantEmail = typeof record.email === 'string' ? (0, invitation_token_1.normalizeEmail)(record.email) : '';
                return tenantUserId === user.uid || Boolean(normalizedUserEmail && tenantEmail === normalizedUserEmail);
            });
            return isResident || isOwner || isTenant;
        })
            .map(([apartmentId]) => apartmentId);
    }
    canManageTenants(user, apartment) {
        if (this.isStaff(user)) {
            return user.role === 'ManagementCompany' && this.apartmentBelongsToStaffCompany(user, apartment);
        }
        if (user.role !== 'Landlord') {
            return false;
        }
        const normalizedUserEmail = (0, invitation_token_1.normalizeEmail)(user.email ?? '');
        const ownerEmail = typeof apartment.ownerEmail === 'string' ? (0, invitation_token_1.normalizeEmail)(apartment.ownerEmail) : '';
        return Boolean(normalizedUserEmail && ownerEmail && normalizedUserEmail === ownerEmail && apartment.ownerActivated === true);
    }
    hasApartmentOccupant(apartment) {
        const hasPrimaryResident = typeof apartment.residentId === 'string' && apartment.residentId.trim().length > 0;
        if (hasPrimaryResident)
            return true;
        const hasActivatedOwner = apartment.ownerActivated === true &&
            ((typeof apartment.ownerId === 'string' && apartment.ownerId.trim().length > 0) ||
                (typeof apartment.ownerEmail === 'string' && apartment.ownerEmail.trim().length > 0));
        if (hasActivatedOwner)
            return true;
        const tenants = Array.isArray(apartment.tenants) ? apartment.tenants : [];
        return tenants.some((tenant) => {
            if (!tenant || typeof tenant !== 'object')
                return false;
            const record = tenant;
            const status = typeof record.status === 'string' ? record.status.trim().toLowerCase() : '';
            const isActiveTenant = record.activated === true ||
                Boolean(record.acceptedAt) ||
                Boolean(record.activatedAt) ||
                status === 'active' ||
                status === 'accepted';
            if (!isActiveTenant || ['removed', 'deleted', 'revoked', 'inactive'].includes(status))
                return false;
            return ((typeof record.userId === 'string' && record.userId.trim().length > 0) ||
                (typeof record.email === 'string' && record.email.trim().length > 0));
        });
    }
};
exports.ApartmentAccessService = ApartmentAccessService;
exports.ApartmentAccessService = ApartmentAccessService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService])
], ApartmentAccessService);
