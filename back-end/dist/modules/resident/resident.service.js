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
exports.ResidentService = void 0;
const common_1 = require("@nestjs/common");
const firebase_admin_service_1 = require("../../common/infrastructure/firebase/firebase-admin.service");
const role_constants_1 = require("../../common/auth/role.constants");
const invitation_token_1 = require("../../common/utils/invitation-token");
let ResidentService = class ResidentService {
    constructor(firebaseAdminService) {
        this.firebaseAdminService = firebaseAdminService;
    }
    toOptionalString(value) {
        return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
    }
    normalizeStaffContacts(value) {
        return Array.isArray(value)
            ? value.filter((item) => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
            : [];
    }
    toSerializable(value) {
        if (value == null)
            return value;
        if (value instanceof Date)
            return value.toISOString();
        if (Array.isArray(value)) {
            return value.map((item) => this.toSerializable(item));
        }
        if (typeof value === 'object') {
            const maybeTimestamp = value;
            if (typeof maybeTimestamp.toDate === 'function') {
                return maybeTimestamp.toDate().toISOString();
            }
            return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, this.toSerializable(nested)]));
        }
        return value;
    }
    async apartments(user) {
        if (!user?.uid)
            throw new common_1.UnauthorizedException('Authentication required');
        if (!(0, role_constants_1.isPropertyMemberRole)(user.role))
            throw new common_1.ForbiddenException('Residents and landlords only');
        const db = this.firebaseAdminService.firestore;
        const userSnap = await db.collection('users').doc(user.uid).get();
        const userData = userSnap.exists ? userSnap.data() : {};
        const normalizedEmail = (0, invitation_token_1.normalizeEmail)(this.toOptionalString(user.email) ?? this.toOptionalString(userData.email) ?? '');
        const apartmentIds = new Set();
        const pushApartmentId = (value) => {
            const apartmentId = this.toOptionalString(value);
            if (apartmentId)
                apartmentIds.add(apartmentId);
        };
        pushApartmentId(user.apartmentId);
        pushApartmentId(userData.apartmentId);
        if (Array.isArray(userData.apartmentIds)) {
            for (const apartmentId of userData.apartmentIds) {
                pushApartmentId(apartmentId);
            }
        }
        const apartmentRefs = Array.from(apartmentIds).map((id) => db.collection('apartments').doc(id));
        const [individualSnaps, residentApartmentsSnap, ownerApartmentsSnap] = await Promise.all([
            apartmentRefs.length > 0 ? db.getAll(...apartmentRefs) : Promise.resolve([]),
            db.collection('apartments').where('residentId', '==', user.uid).get(),
            normalizedEmail
                ? db.collection('apartments').where('ownerEmail', '==', normalizedEmail).get()
                : Promise.resolve(null),
        ]);
        const apartmentsById = individualSnaps
            .filter((snap) => snap.exists)
            .map((snap) => ({ id: snap.id, ...snap.data() }));
        const mergedApartments = new Map();
        for (const apartment of apartmentsById) {
            if (apartment?.id)
                mergedApartments.set(apartment.id, apartment);
        }
        for (const doc of residentApartmentsSnap.docs) {
            mergedApartments.set(doc.id, {
                id: doc.id,
                ...doc.data(),
            });
        }
        if (ownerApartmentsSnap) {
            for (const doc of ownerApartmentsSnap.docs) {
                const apartment = doc.data();
                if (apartment.ownerActivated !== true)
                    continue;
                mergedApartments.set(doc.id, {
                    id: doc.id,
                    ...apartment,
                });
            }
        }
        const tenantApartmentsSnap = await db.collection('apartments').get();
        for (const doc of tenantApartmentsSnap.docs) {
            const apartment = doc.data();
            const tenants = Array.isArray(apartment.tenants) ? apartment.tenants : [];
            const isTenant = tenants.some((tenant) => {
                if (!tenant || typeof tenant !== 'object')
                    return false;
                const t = tenant;
                if (typeof t.userId === 'string' && t.userId === user.uid) {
                    const fromDate = typeof t.fromDate === 'string' ? new Date(t.fromDate) : null;
                    const until = typeof t.until === 'string' ? new Date(t.until) : null;
                    const now = new Date();
                    if (fromDate && now < fromDate)
                        return false;
                    if (until && now > until)
                        return false;
                    return true;
                }
                return false;
            });
            if (isTenant) {
                mergedApartments.set(doc.id, {
                    id: doc.id,
                    ...apartment,
                });
            }
        }
        const hasConfirmedAccess = (apartment) => {
            const isPrimaryResident = this.toOptionalString(apartment.residentId) === user.uid;
            const ownerId = this.toOptionalString(apartment.ownerId);
            const ownerEmail = (0, invitation_token_1.normalizeEmail)(this.toOptionalString(apartment.ownerEmail) ?? '');
            const isActivatedOwner = apartment.ownerActivated === true &&
                ((ownerId && ownerId === user.uid) || Boolean(normalizedEmail && ownerEmail === normalizedEmail));
            const tenants = Array.isArray(apartment.tenants) ? apartment.tenants : [];
            const isTenant = tenants.some((tenant) => {
                if (!tenant || typeof tenant !== 'object')
                    return false;
                const t = tenant;
                if (this.toOptionalString(t.userId) === user.uid) {
                    const fromDate = typeof t.fromDate === 'string' ? new Date(t.fromDate) : null;
                    const until = typeof t.until === 'string' ? new Date(t.until) : null;
                    const now = new Date();
                    if (fromDate && now < fromDate)
                        return false;
                    if (until && now > until)
                        return false;
                    return true;
                }
                return false;
            });
            return isPrimaryResident || isActivatedOwner || isTenant;
        };
        const apartments = Array.from(mergedApartments.values()).filter(hasConfirmedAccess);
        const buildingIds = Array.from(new Set(apartments
            .map((apartment) => this.toOptionalString(apartment.buildingId))
            .filter((value) => Boolean(value))));
        const buildingRefs = buildingIds.map((id) => db.collection('buildings').doc(id));
        const buildingSnaps = buildingRefs.length > 0 ? await db.getAll(...buildingRefs) : [];
        const buildings = buildingSnaps
            .filter((snap) => snap.exists)
            .map((snap) => ({
            id: snap.id,
            ...snap.data(),
        }));
        const companyIds = new Set();
        const pushCompanyId = (value) => {
            const companyId = this.toOptionalString(value);
            if (companyId)
                companyIds.add(companyId);
        };
        for (const apartment of apartments) {
            pushCompanyId(apartment.companyId);
            pushCompanyId(apartment.managementCompanyId);
            pushCompanyId(apartment.managerCompanyId);
            if (Array.isArray(apartment.companyIds)) {
                apartment.companyIds.forEach(pushCompanyId);
            }
            const managedBy = apartment.managedBy && typeof apartment.managedBy === 'object'
                ? apartment.managedBy
                : null;
            pushCompanyId(managedBy?.companyId);
        }
        for (const building of buildings) {
            pushCompanyId(building.companyId);
            const managedBy = building.managedBy && typeof building.managedBy === 'object'
                ? building.managedBy
                : null;
            pushCompanyId(managedBy?.companyId);
        }
        const companyRefs = Array.from(companyIds).map((id) => db.collection('companies').doc(id));
        const companySnaps = companyRefs.length > 0 ? await db.getAll(...companyRefs) : [];
        const managementCompanies = companySnaps
            .filter((snap) => snap.exists)
            .map((snap) => {
            const company = snap.data();
            const staffContacts = this.normalizeStaffContacts(company.staffContacts)
                .filter((contact) => contact.createAccount === false);
            return {
                id: snap.id,
                companyName: this.toOptionalString(company.companyName) ?? this.toOptionalString(company.name),
                companyEmail: this.toOptionalString(company.companyEmail) ?? this.toOptionalString(company.email),
                companyPhone: this.toOptionalString(company.companyPhone) ?? this.toOptionalString(company.phone),
                staffContacts,
            };
        });
        return {
            apartments: this.toSerializable(apartments),
            buildings: this.toSerializable(buildings),
            managementCompanies: this.toSerializable(managementCompanies),
        };
    }
};
exports.ResidentService = ResidentService;
exports.ResidentService = ResidentService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService])
], ResidentService);
