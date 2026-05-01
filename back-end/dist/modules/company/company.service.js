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
exports.CompanyService = void 0;
const common_1 = require("@nestjs/common");
const firestore_1 = require("firebase-admin/firestore");
const firebase_admin_service_1 = require("../../common/infrastructure/firebase/firebase-admin.service");
const rate_limit_service_1 = require("../../common/services/rate-limit.service");
let CompanyService = class CompanyService {
    constructor(firebaseAdminService, rateLimitService) {
        this.firebaseAdminService = firebaseAdminService;
        this.rateLimitService = rateLimitService;
    }
    assertAuthenticated(user) {
        if (!user?.uid)
            throw new common_1.UnauthorizedException('Authentication required');
    }
    async enforceRateLimit(request, scope, discriminator, limit) {
        const rl = await this.rateLimitService.consume(this.rateLimitService.buildKey(request, scope, discriminator), limit, 60_000);
        if (!rl.allowed)
            throw new common_1.BadRequestException('Too many requests');
    }
    normalizeCompanyPayload(payload, existing) {
        const normalizedName = typeof payload.companyName === 'string'
            ? payload.companyName.trim()
            : typeof payload.name === 'string'
                ? payload.name.trim()
                : typeof existing?.companyName === 'string'
                    ? existing.companyName
                    : typeof existing?.name === 'string'
                        ? existing.name
                        : '';
        const normalizedEmail = typeof payload.companyEmail === 'string'
            ? payload.companyEmail.trim().toLowerCase()
            : typeof payload.email === 'string'
                ? payload.email.trim().toLowerCase()
                : typeof payload.contactEmail === 'string'
                    ? payload.contactEmail.trim().toLowerCase()
                    : typeof existing?.companyEmail === 'string'
                        ? existing.companyEmail
                        : typeof existing?.contactEmail === 'string'
                            ? existing.contactEmail
                            : typeof existing?.email === 'string'
                                ? existing.email
                                : undefined;
        const normalizedPhone = typeof payload.companyPhone === 'string'
            ? payload.companyPhone.trim()
            : typeof payload.phone === 'string'
                ? payload.phone.trim()
                : typeof payload.contactPhone === 'string'
                    ? payload.contactPhone.trim()
                    : typeof existing?.companyPhone === 'string'
                        ? existing.companyPhone
                        : typeof existing?.contactPhone === 'string'
                            ? existing.contactPhone
                            : typeof existing?.phone === 'string'
                                ? existing.phone
                                : undefined;
        const normalizedRegistrationNumber = typeof payload.registrationNumber === 'string'
            ? payload.registrationNumber.trim()
            : typeof existing?.registrationNumber === 'string'
                ? existing.registrationNumber
                : undefined;
        const normalizedUserIds = Array.isArray(payload.userIds)
            ? payload.userIds.filter((value) => typeof value === 'string' && value.trim().length > 0)
            : Array.isArray(existing?.userIds)
                ? existing.userIds.filter((value) => typeof value === 'string' && value.trim().length > 0)
                : [];
        const normalizedBuildings = Array.isArray(payload.buildings)
            ? payload.buildings
            : Array.isArray(existing?.buildings)
                ? existing.buildings
                : [];
        const normalizedManager = Array.from(new Set([
            ...(Array.isArray(payload.manager)
                ? payload.manager.filter((value) => typeof value === 'string' && value.trim().length > 0)
                : []),
            ...(typeof payload.manager === 'string' && payload.manager.trim().length > 0
                ? [payload.manager.trim()]
                : []),
            ...(Array.isArray(existing?.manager)
                ? existing.manager.filter((value) => typeof value === 'string' && value.trim().length > 0)
                : []),
        ]));
        return Object.fromEntries(Object.entries({
            companyName: normalizedName || undefined,
            companyEmail: normalizedEmail,
            companyPhone: normalizedPhone,
            registrationNumber: normalizedRegistrationNumber,
            manager: normalizedManager,
            companyId: typeof payload.companyId === 'string'
                ? payload.companyId.trim()
                : typeof existing?.companyId === 'string'
                    ? existing.companyId
                    : undefined,
            userIds: normalizedUserIds,
            buildings: normalizedBuildings,
            name: firestore_1.FieldValue.delete(),
            email: firestore_1.FieldValue.delete(),
            phone: firestore_1.FieldValue.delete(),
            contactEmail: firestore_1.FieldValue.delete(),
            contactPhone: firestore_1.FieldValue.delete(),
            firstName: firestore_1.FieldValue.delete(),
            lastName: firestore_1.FieldValue.delete(),
            fullName: firestore_1.FieldValue.delete(),
            contactName: firestore_1.FieldValue.delete(),
            userId: firestore_1.FieldValue.delete(),
            role: firestore_1.FieldValue.delete(),
            accountType: firestore_1.FieldValue.delete(),
        }).filter(([, value]) => value !== undefined && value !== ''));
    }
    async create(request, user, payload) {
        this.assertAuthenticated(user);
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
        await this.enforceRateLimit(request, 'company:create', user.uid, 10);
        const normalizedPayload = this.normalizeCompanyPayload(payload);
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
        return { id: ref.id, ...data };
    }
    async byId(request, user, companyId) {
        this.assertAuthenticated(user);
        if (!companyId?.trim())
            throw new common_1.BadRequestException('companyId is required');
        await this.enforceRateLimit(request, 'company:by-id', `${user.uid}:${companyId}`, 40);
        const snap = await this.firebaseAdminService.firestore.collection('companies').doc(companyId).get();
        if (!snap.exists)
            throw new common_1.NotFoundException('Company not found');
        const data = snap.data();
        const manager = Array.isArray(data.manager)
            ? data.manager.filter((value) => typeof value === 'string' && value.trim().length > 0)
            : [];
        const userIds = Array.isArray(data.userIds)
            ? data.userIds.filter((value) => typeof value === 'string' && value.trim().length > 0)
            : [];
        if (user.companyId && user.companyId !== companyId && !manager.includes(user.uid) && !userIds.includes(user.uid)) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        return { id: snap.id, ...data };
    }
    async update(request, user, companyId, payload) {
        this.assertAuthenticated(user);
        if (!companyId?.trim())
            throw new common_1.BadRequestException('companyId is required');
        await this.enforceRateLimit(request, 'company:update', `${user.uid}:${companyId}`, 30);
        const ref = this.firebaseAdminService.firestore.collection('companies').doc(companyId);
        const snap = await ref.get();
        if (!snap.exists)
            throw new common_1.NotFoundException('Company not found');
        const current = snap.data();
        const manager = Array.isArray(current.manager)
            ? current.manager.filter((value) => typeof value === 'string' && value.trim().length > 0)
            : [];
        const userIds = Array.isArray(current.userIds)
            ? current.userIds.filter((value) => typeof value === 'string' && value.trim().length > 0)
            : [];
        if (user.companyId && user.companyId !== companyId && !manager.includes(user.uid) && !userIds.includes(user.uid)) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        const normalizedPayload = this.normalizeCompanyPayload(payload, current);
        await ref.set({ ...normalizedPayload, updatedAt: new Date() }, { merge: true });
        return { success: true };
    }
};
exports.CompanyService = CompanyService;
exports.CompanyService = CompanyService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        rate_limit_service_1.RateLimitService])
], CompanyService);
