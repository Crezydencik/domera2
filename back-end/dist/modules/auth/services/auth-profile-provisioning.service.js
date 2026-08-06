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
exports.AuthProfileProvisioningService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const firestore_1 = require("firebase-admin/firestore");
const role_constants_1 = require("../../../common/auth/role.constants");
const firebase_admin_service_1 = require("../../../common/infrastructure/firebase/firebase-admin.service");
let AuthProfileProvisioningService = class AuthProfileProvisioningService {
    constructor(firebaseAdminService, configService) {
        this.firebaseAdminService = firebaseAdminService;
        this.configService = configService;
    }
    isConfiguredPlatformAdmin(input) {
        const { emails, uids } = this.getConfiguredPlatformAdmins();
        const uid = input.uid?.trim().toLowerCase();
        const email = input.email?.trim().toLowerCase();
        return Boolean((uid && uids.has(uid)) || (email && emails.has(email)));
    }
    async ensureUserProfileDocument(input) {
        const ref = this.firebaseAdminService.firestore.collection('users').doc(input.uid);
        const snap = await ref.get();
        const current = snap.exists ? snap.data() : {};
        const isPlatformAdmin = this.isConfiguredPlatformAdmin({ uid: input.uid, email: input.email });
        const accountType = isPlatformAdmin
            ? 'PlatformAdmin'
            : ((0, role_constants_1.resolveAccountType)({ role: current.role, accountType: input.accountType ?? current.accountType }) ?? 'Resident');
        const role = isPlatformAdmin
            ? 'PlatformAdmin'
            : ((0, role_constants_1.resolveUserRole)({
                role: input.role ?? current.role,
                accountType: input.accountType ?? current.accountType ?? accountType,
            }) ?? accountType);
        const firstName = (typeof input.firstName === 'string' && input.firstName.trim()) ||
            (typeof current.firstName === 'string' ? current.firstName : undefined);
        const lastName = (typeof input.lastName === 'string' && input.lastName.trim()) ||
            (typeof current.lastName === 'string' ? current.lastName : undefined);
        const fullName = [firstName, lastName].filter((value) => Boolean(value)).join(' ').trim() ||
            (typeof current.fullName === 'string' ? current.fullName : undefined);
        const phone = (typeof input.phone === 'string' && input.phone.trim()) ||
            (typeof current.phone === 'string' ? current.phone : undefined);
        const companyId = (typeof current.companyId === 'string' && current.companyId.trim()) ||
            (accountType === 'ManagementCompany' ? input.uid : undefined);
        const apartmentId = (typeof input.apartmentId === 'string' && input.apartmentId.trim()) ||
            (typeof current.apartmentId === 'string' ? current.apartmentId : undefined);
        const acceptedPrivacyPolicyAt = input.acceptedPrivacyPolicyAt ||
            (current.acceptedPrivacyPolicyAt instanceof Date
                ? current.acceptedPrivacyPolicyAt
                : (current.acceptedPrivacyPolicyAt?.toDate?.() ?? undefined));
        const acceptedTermsAt = input.acceptedTermsAt ||
            (current.acceptedTermsAt instanceof Date
                ? current.acceptedTermsAt
                : (current.acceptedTermsAt?.toDate?.() ?? undefined));
        const nextDataWithoutUpdatedAt = Object.fromEntries(Object.entries({
            ...current,
            uid: input.uid,
            email: input.email,
            role,
            accountType,
            companyId,
            apartmentId,
            firstName,
            lastName,
            fullName,
            phone,
            companyName: (typeof input.companyName === 'string' && input.companyName.trim()) ||
                (typeof current.companyName === 'string' ? current.companyName : undefined),
            registrationNumber: (typeof input.registrationNumber === 'string' && input.registrationNumber.trim()) ||
                (typeof current.registrationNumber === 'string' ? current.registrationNumber : undefined),
            acceptedPrivacyPolicyAt,
            acceptedTermsAt,
            createdAt: current.createdAt ?? new Date(),
        }).filter(([, value]) => value !== undefined && value !== ''));
        const shouldWrite = !snap.exists || this.hasDocumentChanges(current, nextDataWithoutUpdatedAt);
        const nextData = shouldWrite
            ? { ...nextDataWithoutUpdatedAt, updatedAt: new Date() }
            : nextDataWithoutUpdatedAt;
        if (shouldWrite) {
            await ref.set(nextData, { merge: true });
        }
        return nextData;
    }
    async ensureManagementCompanyDocument(input) {
        const ref = this.firebaseAdminService.firestore.collection('companies').doc(input.uid);
        const snap = await ref.get();
        const current = snap.exists ? snap.data() : {};
        const companyName = (typeof input.companyName === 'string' && input.companyName.trim()) ||
            (typeof current.companyName === 'string' ? current.companyName : undefined) ||
            (typeof current.name === 'string' ? current.name : undefined) ||
            input.email;
        const companyEmail = (typeof input.companyEmail === 'string' && input.companyEmail.trim()
            ? this.normalizeEmail(input.companyEmail)
            : undefined) ||
            (typeof current.companyEmail === 'string' && current.companyEmail.trim()
                ? this.normalizeEmail(current.companyEmail)
                : undefined) ||
            (typeof current.email === 'string' && current.email.trim()
                ? this.normalizeEmail(current.email)
                : undefined) ||
            (typeof current.contactEmail === 'string' && current.contactEmail.trim()
                ? this.normalizeEmail(current.contactEmail)
                : undefined) ||
            input.email;
        const companyPhone = (typeof input.phone === 'string' && input.phone.trim()) ||
            (typeof current.companyPhone === 'string' ? current.companyPhone : undefined) ||
            (typeof current.phone === 'string' ? current.phone : undefined) ||
            (typeof current.contactPhone === 'string' ? current.contactPhone : undefined);
        const registrationNumber = (typeof input.registrationNumber === 'string' && input.registrationNumber.trim()) ||
            (typeof current.registrationNumber === 'string' ? current.registrationNumber : undefined);
        const currentManagers = Array.isArray(current.manager)
            ? current.manager.filter((value) => typeof value === 'string' && value.trim().length > 0)
            : [];
        const manager = Array.from(new Set([...currentManagers, input.uid]));
        const currentUserIds = Array.isArray(current.userIds)
            ? current.userIds.filter((value) => typeof value === 'string' && value.trim().length > 0)
            : [];
        const userIds = Array.from(new Set([...currentUserIds, input.uid]));
        const cleanupFields = [
            'userId',
            'role',
            'accountType',
            'name',
            'email',
            'phone',
            'contactEmail',
            'contactPhone',
            'firstName',
            'lastName',
            'fullName',
            'contactName',
        ];
        const cleanupData = Object.fromEntries(cleanupFields
            .filter((field) => current[field] !== undefined)
            .map((field) => [field, firestore_1.FieldValue.delete()]));
        const nextDataWithoutUpdatedAt = Object.fromEntries(Object.entries({
            ...current,
            manager,
            companyId: input.uid,
            userIds,
            companyName,
            companyEmail,
            companyPhone,
            registrationNumber,
            buildings: Array.isArray(current.buildings) ? current.buildings : [],
            createdAt: current.createdAt ?? new Date(),
        }).filter(([, value]) => value !== undefined && value !== ''));
        const shouldWrite = !snap.exists ||
            Object.keys(cleanupData).length > 0 ||
            this.hasDocumentChanges(current, nextDataWithoutUpdatedAt);
        const nextData = shouldWrite
            ? { ...nextDataWithoutUpdatedAt, ...cleanupData, updatedAt: new Date() }
            : nextDataWithoutUpdatedAt;
        if (shouldWrite) {
            await ref.set(nextData, { merge: true });
        }
        if (current.storageFoldersStatus !== 'ready') {
            void this.ensureCompanyStorageFolders(ref, input.uid).catch((error) => {
                console.error('Failed to schedule management company storage folders:', error);
            });
        }
        return nextData;
    }
    normalizeEmail(email) {
        return email.trim().toLowerCase();
    }
    getConfiguredPlatformAdmins() {
        const splitList = (value) => String(value ?? '')
            .split(/[,\s;]+/)
            .map((item) => item.trim().toLowerCase())
            .filter(Boolean);
        return {
            emails: new Set(splitList(this.configService.get('PLATFORM_ADMIN_EMAILS'))),
            uids: new Set(splitList(this.configService.get('PLATFORM_ADMIN_UIDS'))),
        };
    }
    isSameDocumentValue(currentValue, nextValue) {
        if (nextValue instanceof Date) {
            const currentMillis = currentValue instanceof Date
                ? currentValue.getTime()
                : currentValue?.toMillis?.();
            return currentMillis === nextValue.getTime();
        }
        if (Array.isArray(nextValue)) {
            return (Array.isArray(currentValue) &&
                nextValue.length === currentValue.length &&
                nextValue.every((value, index) => currentValue[index] === value));
        }
        return currentValue === nextValue;
    }
    hasDocumentChanges(current, next) {
        return Object.entries(next).some(([key, value]) => !this.isSameDocumentValue(current[key], value));
    }
    getCompanyStorageFolders(companyId) {
        const base = `companies/${companyId}`;
        return [
            base,
            `${base}/buildings`,
            `${base}/documents`,
            `${base}/invoices`,
        ];
    }
    async ensureCompanyStorageFolders(ref, companyId) {
        try {
            await this.firebaseAdminService.createStorageFolders(this.getCompanyStorageFolders(companyId));
            await ref.set({
                storageFoldersStatus: 'ready',
                storageFoldersError: firestore_1.FieldValue.delete(),
                storageFoldersUpdatedAt: new Date(),
            }, { merge: true });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('Failed to create management company storage folders:', message);
            await ref.set({
                storageFoldersStatus: 'pending',
                storageFoldersError: message,
                storageFoldersUpdatedAt: new Date(),
            }, { merge: true });
        }
    }
};
exports.AuthProfileProvisioningService = AuthProfileProvisioningService;
exports.AuthProfileProvisioningService = AuthProfileProvisioningService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        config_1.ConfigService])
], AuthProfileProvisioningService);
