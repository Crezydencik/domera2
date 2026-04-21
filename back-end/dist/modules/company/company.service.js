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
    async create(request, user, payload) {
        this.assertAuthenticated(user);
        const name = typeof payload.name === 'string' ? payload.name.trim() : '';
        const userId = typeof payload.userId === 'string' ? payload.userId.trim() : '';
        if (!name || !userId)
            throw new common_1.BadRequestException('name and userId are required');
        if (user.uid !== userId)
            throw new common_1.ForbiddenException('Cannot create company for another user');
        await this.enforceRateLimit(request, 'company:create', user.uid, 10);
        const data = {
            ...payload,
            name,
            userId,
            buildings: Array.isArray(payload.buildings) ? payload.buildings : [],
            createdAt: new Date(),
        };
        const ref = this.firebaseAdminService.firestore.collection('companies').doc();
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
        const ownerUserId = typeof data.userId === 'string' ? data.userId : undefined;
        if (user.companyId && user.companyId !== companyId && ownerUserId !== user.uid) {
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
        const ownerUserId = typeof current.userId === 'string' ? current.userId : undefined;
        if (user.companyId && user.companyId !== companyId && ownerUserId !== user.uid) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        await ref.set({ ...payload, updatedAt: new Date() }, { merge: true });
        return { success: true };
    }
};
exports.CompanyService = CompanyService;
exports.CompanyService = CompanyService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        rate_limit_service_1.RateLimitService])
], CompanyService);
