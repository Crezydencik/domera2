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
exports.ProjectsService = void 0;
const common_1 = require("@nestjs/common");
const firebase_admin_service_1 = require("../../common/infrastructure/firebase/firebase-admin.service");
const rate_limit_service_1 = require("../../common/services/rate-limit.service");
let ProjectsService = class ProjectsService {
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
        await this.enforceRateLimit(request, 'projects:list', `${user.uid}:${normalizedCompanyId}`, 60);
        const snap = await this.firebaseAdminService.firestore
            .collection('projects')
            .where('companyId', '==', normalizedCompanyId)
            .get();
        return {
            items: snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
        };
    }
    async byId(request, user, projectId) {
        this.assertManagement(user);
        if (!projectId?.trim())
            throw new common_1.BadRequestException('projectId is required');
        await this.enforceRateLimit(request, 'projects:by-id', `${user.uid}:${projectId}`, 80);
        const snap = await this.firebaseAdminService.firestore.collection('projects').doc(projectId).get();
        if (!snap.exists)
            throw new common_1.NotFoundException('Project not found');
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
        await this.enforceRateLimit(request, 'projects:create', `${user.uid}:${companyId}`, 30);
        const data = {
            ...payload,
            companyId,
            title,
            createdAt: new Date(),
        };
        const ref = this.firebaseAdminService.firestore.collection('projects').doc();
        await ref.set(data);
        return { id: ref.id, ...data };
    }
    async update(request, user, projectId, payload) {
        this.assertManagement(user);
        if (!projectId?.trim())
            throw new common_1.BadRequestException('projectId is required');
        await this.enforceRateLimit(request, 'projects:update', `${user.uid}:${projectId}`, 50);
        const ref = this.firebaseAdminService.firestore.collection('projects').doc(projectId);
        const snap = await ref.get();
        if (!snap.exists)
            throw new common_1.NotFoundException('Project not found');
        const current = snap.data();
        if (user.companyId && typeof current.companyId === 'string' && user.companyId !== current.companyId) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        await ref.set({ ...payload, updatedAt: new Date() }, { merge: true });
        return { success: true };
    }
    async remove(request, user, projectId) {
        this.assertManagement(user);
        if (!projectId?.trim())
            throw new common_1.BadRequestException('projectId is required');
        await this.enforceRateLimit(request, 'projects:delete', `${user.uid}:${projectId}`, 30);
        const ref = this.firebaseAdminService.firestore.collection('projects').doc(projectId);
        const snap = await ref.get();
        if (!snap.exists)
            throw new common_1.NotFoundException('Project not found');
        const current = snap.data();
        if (user.companyId && typeof current.companyId === 'string' && user.companyId !== current.companyId) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        await ref.delete();
        return { success: true };
    }
};
exports.ProjectsService = ProjectsService;
exports.ProjectsService = ProjectsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        rate_limit_service_1.RateLimitService])
], ProjectsService);
