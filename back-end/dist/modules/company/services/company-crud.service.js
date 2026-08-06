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
exports.CompanyCrudService = void 0;
const common_1 = require("@nestjs/common");
const firebase_admin_service_1 = require("../../../common/infrastructure/firebase/firebase-admin.service");
const company_access_service_1 = require("./company-access.service");
const company_payload_service_1 = require("./company-payload.service");
const company_storage_service_1 = require("./company-storage.service");
let CompanyCrudService = class CompanyCrudService {
    constructor(firebaseAdminService, accessService, payloadService, storageService) {
        this.firebaseAdminService = firebaseAdminService;
        this.accessService = accessService;
        this.payloadService = payloadService;
        this.storageService = storageService;
    }
    async create(request, user, payload) {
        this.accessService.assertAuthenticated(user);
        const companyName = typeof payload.companyName === 'string'
            ? payload.companyName.trim()
            : typeof payload.name === 'string'
                ? payload.name.trim()
                : '';
        const userId = typeof payload.userId === 'string' ? payload.userId.trim() : '';
        if (!companyName || !userId)
            throw new common_1.BadRequestException('companyName and userId are required');
        if (user.uid !== userId)
            throw new common_1.ForbiddenException('Cannot create company for another user');
        await this.accessService.enforceRateLimit(request, 'company:create', user.uid, 10);
        const normalizedPayload = this.payloadService.normalizeCompanyPayload(payload);
        const data = {
            ...normalizedPayload,
            companyName,
            manager: Array.from(new Set([...(Array.isArray(normalizedPayload.manager) ? normalizedPayload.manager : []), userId])),
            companyId: userId,
            userIds: [userId],
            buildings: Array.isArray(normalizedPayload.buildings) ? normalizedPayload.buildings : [],
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        const ref = this.firebaseAdminService.firestore.collection('companies').doc(userId);
        await ref.set(data);
        await this.storageService.markStorageFolders(ref, this.storageService.getCompanyStorageFolders(ref.id));
        return { id: ref.id, ...data };
    }
    async byId(request, user, companyId) {
        this.accessService.assertAuthenticated(user);
        if (!companyId?.trim())
            throw new common_1.BadRequestException('companyId is required');
        await this.accessService.enforceRateLimit(request, 'company:by-id', `${user.uid}:${companyId}`, 40);
        const snap = await this.firebaseAdminService.firestore.collection('companies').doc(companyId).get();
        if (!snap.exists)
            throw new common_1.NotFoundException('Company not found');
        const data = snap.data();
        this.accessService.assertCompanyAccess(user, companyId, data);
        const publicContactsSnap = await this.firebaseAdminService.firestore
            .collection('users')
            .where('companyId', '==', companyId)
            .where('showContactToResidents', '==', true)
            .get();
        const staffContacts = this.payloadService.normalizeStaffContacts(data.staffContacts);
        const publicStaffContacts = staffContacts
            .filter((contact) => contact.showContactToResidents === true)
            .map((contact) => ({
            id: this.payloadService.firstString(contact.id, contact.email),
            fullName: this.payloadService.firstString(contact.fullName, contact.name, contact.email),
            email: this.payloadService.firstString(contact.email),
            phone: this.payloadService.firstString(contact.phone),
            position: this.payloadService.firstString(contact.position, contact.jobTitle, contact.comment),
            comment: this.payloadService.firstString(contact.comment),
            role: this.payloadService.firstString(contact.role, 'ManagementCompany'),
        }));
        const publicContacts = publicContactsSnap.docs
            .map((doc) => {
            const contact = doc.data();
            const fullName = this.payloadService.firstString(contact.fullName, [contact.firstName, contact.lastName]
                .filter((value) => typeof value === 'string' && value.trim().length > 0)
                .join(' '), contact.name, contact.displayName, contact.email);
            return {
                id: doc.id,
                fullName,
                email: this.payloadService.firstString(contact.email),
                phone: this.payloadService.firstString(contact.phone, contact.phoneNumber),
                position: this.payloadService.firstString(contact.position, contact.jobTitle),
                role: this.payloadService.firstString(contact.role, contact.accountType),
            };
        })
            .filter((contact) => contact.fullName || contact.email || contact.phone);
        return { id: snap.id, ...data, staffContacts, publicContacts: [...publicContacts, ...publicStaffContacts] };
    }
    async update(request, user, companyId, payload) {
        this.accessService.assertAuthenticated(user);
        if (!companyId?.trim())
            throw new common_1.BadRequestException('companyId is required');
        await this.accessService.enforceRateLimit(request, 'company:update', `${user.uid}:${companyId}`, 30);
        const ref = this.firebaseAdminService.firestore.collection('companies').doc(companyId);
        const snap = await ref.get();
        if (!snap.exists)
            throw new common_1.NotFoundException('Company not found');
        const current = snap.data();
        this.accessService.assertCompanyAccess(user, companyId, current);
        const normalizedPayload = this.payloadService.normalizeCompanyPayload(payload, current);
        await ref.set({ ...normalizedPayload, updatedAt: new Date() }, { merge: true });
        return { success: true };
    }
};
exports.CompanyCrudService = CompanyCrudService;
exports.CompanyCrudService = CompanyCrudService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        company_access_service_1.CompanyAccessService,
        company_payload_service_1.CompanyPayloadService,
        company_storage_service_1.CompanyStorageService])
], CompanyCrudService);
