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
exports.NewsService = void 0;
const common_1 = require("@nestjs/common");
const firebase_admin_service_1 = require("../../common/infrastructure/firebase/firebase-admin.service");
const rate_limit_service_1 = require("../../common/services/rate-limit.service");
let NewsService = class NewsService {
    constructor(firebaseAdminService, rateLimitService) {
        this.firebaseAdminService = firebaseAdminService;
        this.rateLimitService = rateLimitService;
    }
    assertManagement(user) {
        if (!user?.uid || !user.role)
            throw new common_1.UnauthorizedException('Authentication required');
        if (!['ManagementCompany', 'Accountant'].includes(user.role)) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
    }
    async enforceRateLimit(request, scope, discriminator, limit) {
        const rl = await this.rateLimitService.consume(this.rateLimitService.buildKey(request, scope, discriminator), limit, 60_000);
        if (!rl.allowed)
            throw new common_1.BadRequestException('Too many requests');
    }
    async list(request, user, companyId) {
        this.assertManagement(user);
        const normalizedCompanyId = companyId?.trim();
        if (!normalizedCompanyId)
            throw new common_1.BadRequestException('companyId is required');
        if (user.companyId && user.companyId !== normalizedCompanyId) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        await this.enforceRateLimit(request, 'news:list', `${user.uid}:${normalizedCompanyId}`, 60);
        const snap = await this.firebaseAdminService.firestore
            .collection('news')
            .where('companyId', '==', normalizedCompanyId)
            .get();
        return {
            items: snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
        };
    }
    async byId(request, user, newsId) {
        this.assertManagement(user);
        if (!newsId?.trim())
            throw new common_1.BadRequestException('newsId is required');
        await this.enforceRateLimit(request, 'news:by-id', `${user.uid}:${newsId}`, 80);
        const snap = await this.firebaseAdminService.firestore.collection('news').doc(newsId).get();
        if (!snap.exists)
            throw new common_1.NotFoundException('News not found');
        const data = snap.data();
        if (user.companyId && typeof data.companyId === 'string' && user.companyId !== data.companyId) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        return { id: snap.id, ...data };
    }
    async create(request, user, payload) {
        this.assertManagement(user);
        const companyId = typeof payload.companyId === 'string' ? payload.companyId.trim() : '';
        const title = typeof payload.title === 'string' ? payload.title.trim() : '';
        if (!companyId)
            throw new common_1.BadRequestException('companyId is required');
        if (!title)
            throw new common_1.BadRequestException('title is required');
        if (user.companyId && user.companyId !== companyId) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        await this.enforceRateLimit(request, 'news:create', `${user.uid}:${companyId}`, 30);
        const data = {
            ...payload,
            companyId,
            title,
            createdAt: new Date(),
        };
        const ref = this.firebaseAdminService.firestore.collection('news').doc();
        await ref.set(data);
        return { id: ref.id, ...data };
    }
    async update(request, user, newsId, payload) {
        this.assertManagement(user);
        if (!newsId?.trim())
            throw new common_1.BadRequestException('newsId is required');
        await this.enforceRateLimit(request, 'news:update', `${user.uid}:${newsId}`, 50);
        const ref = this.firebaseAdminService.firestore.collection('news').doc(newsId);
        const snap = await ref.get();
        if (!snap.exists)
            throw new common_1.NotFoundException('News not found');
        const current = snap.data();
        if (user.companyId && typeof current.companyId === 'string' && user.companyId !== current.companyId) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        await ref.set({ ...payload, updatedAt: new Date() }, { merge: true });
        return { success: true };
    }
    async remove(request, user, newsId) {
        this.assertManagement(user);
        if (!newsId?.trim())
            throw new common_1.BadRequestException('newsId is required');
        await this.enforceRateLimit(request, 'news:delete', `${user.uid}:${newsId}`, 30);
        const ref = this.firebaseAdminService.firestore.collection('news').doc(newsId);
        const snap = await ref.get();
        if (!snap.exists)
            throw new common_1.NotFoundException('News not found');
        const current = snap.data();
        if (user.companyId && typeof current.companyId === 'string' && user.companyId !== current.companyId) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        await ref.delete();
        return { success: true };
    }
};
exports.NewsService = NewsService;
exports.NewsService = NewsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        rate_limit_service_1.RateLimitService])
], NewsService);
