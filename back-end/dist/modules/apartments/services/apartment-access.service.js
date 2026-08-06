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
let ApartmentAccessService = class ApartmentAccessService {
    constructor(firebaseAdminService) {
        this.firebaseAdminService = firebaseAdminService;
    }
    assertAuthenticated(user) {
        if (!user?.uid || !user.role) {
            throw new common_1.UnauthorizedException('Authentication required');
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
        const buildingId = this.firstString(apartment.buildingId, apartment.houseId);
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
        const apartmentIds = new Set();
        const addApartmentId = (value) => {
            if (typeof value === 'string' && value.trim()) {
                apartmentIds.add(value.trim());
            }
        };
        addApartmentId(user.apartmentId);
        const userSnap = await this.firebaseAdminService.firestore.collection('users').doc(user.uid).get();
        const userData = userSnap.exists ? userSnap.data() : {};
        addApartmentId(userData.apartmentId);
        if (Array.isArray(userData.apartmentIds)) {
            for (const apartmentId of userData.apartmentIds) {
                addApartmentId(apartmentId);
            }
        }
        const normalizedEmail = (0, invitation_token_1.normalizeEmail)((typeof user.email === 'string' ? user.email : typeof userData.email === 'string' ? userData.email : '') ?? '');
        if (normalizedEmail) {
            const [residentSnap, ownerIdSnap, ownerEmailSnap] = await Promise.all([
                this.firebaseAdminService.firestore.collection('apartments').where('residentId', '==', user.uid).get(),
                this.firebaseAdminService.firestore.collection('apartments').where('ownerId', '==', user.uid).get(),
                this.firebaseAdminService.firestore.collection('apartments').where('ownerEmail', '==', normalizedEmail).get(),
            ]);
            for (const doc of residentSnap.docs) {
                apartmentIds.add(doc.id);
            }
            for (const snap of [ownerIdSnap, ownerEmailSnap]) {
                for (const doc of snap.docs) {
                    const apartment = doc.data();
                    if (apartment.ownerActivated === true) {
                        apartmentIds.add(doc.id);
                    }
                }
            }
        }
        const candidateIds = Array.from(apartmentIds);
        if (candidateIds.length === 0)
            return [];
        const refs = candidateIds.map((id) => this.firebaseAdminService.firestore.collection('apartments').doc(id));
        const snaps = await this.firebaseAdminService.firestore.getAll(...refs);
        const normalizedUserEmail = (0, invitation_token_1.normalizeEmail)(user.email ?? '');
        return snaps
            .filter((snap) => snap.exists)
            .filter((snap) => {
            const apartment = snap.data();
            const residentId = typeof apartment.residentId === 'string' ? apartment.residentId : '';
            const ownerId = typeof apartment.ownerId === 'string' ? apartment.ownerId : '';
            const ownerEmail = typeof apartment.ownerEmail === 'string' ? (0, invitation_token_1.normalizeEmail)(apartment.ownerEmail) : '';
            const isResident = residentId === user.uid;
            const isOwner = apartment.ownerActivated === true &&
                ((ownerId && ownerId === user.uid) || Boolean(normalizedUserEmail && ownerEmail === normalizedUserEmail));
            const tenants = Array.isArray(apartment.tenants) ? apartment.tenants : [];
            const isTenant = tenants.some((tenant) => {
                if (!tenant || typeof tenant !== 'object')
                    return false;
                return typeof tenant.userId === 'string'
                    && tenant.userId === user.uid;
            });
            return isResident || isOwner || isTenant;
        })
            .map((snap) => snap.id);
    }
    canManageTenants(user, apartment) {
        if (this.isStaff(user)) {
            return this.apartmentBelongsToStaffCompany(user, apartment);
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
            if (['removed', 'deleted', 'revoked', 'inactive'].includes(status))
                return false;
            return ((typeof record.userId === 'string' && record.userId.trim().length > 0) ||
                (typeof record.email === 'string' && record.email.trim().length > 0));
        });
    }
    firstString(...values) {
        for (const value of values) {
            if (typeof value === 'string' && value.trim()) {
                return value.trim();
            }
            if (typeof value === 'number' && Number.isFinite(value)) {
                return String(value);
            }
        }
        return '';
    }
};
exports.ApartmentAccessService = ApartmentAccessService;
exports.ApartmentAccessService = ApartmentAccessService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService])
], ApartmentAccessService);
