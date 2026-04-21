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
exports.BuildingsService = void 0;
const common_1 = require("@nestjs/common");
const firebase_admin_service_1 = require("../../common/infrastructure/firebase/firebase-admin.service");
const rate_limit_service_1 = require("../../common/services/rate-limit.service");
let BuildingsService = class BuildingsService {
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
        await this.enforceRateLimit(request, 'buildings:list', `${user.uid}:${normalizedCompanyId}`, 50);
        const db = this.firebaseAdminService.firestore;
        const [legacySnap, managedBySnap] = await Promise.all([
            db.collection('buildings').where('companyId', '==', normalizedCompanyId).get(),
            db.collection('buildings').where('managedBy.companyId', '==', normalizedCompanyId).get(),
        ]);
        const merged = new Map();
        for (const doc of [...legacySnap.docs, ...managedBySnap.docs]) {
            merged.set(doc.id, doc.data());
        }
        return {
            items: Array.from(merged.entries()).map(([id, data]) => ({ id, ...data })),
        };
    }
    async byId(request, user, buildingId) {
        this.assertManagement(user);
        if (!buildingId?.trim())
            throw new common_1.BadRequestException('buildingId is required');
        await this.enforceRateLimit(request, 'buildings:by-id', `${user.uid}:${buildingId}`, 60);
        const snap = await this.firebaseAdminService.firestore.collection('buildings').doc(buildingId).get();
        if (!snap.exists)
            throw new common_1.NotFoundException('Building not found');
        const data = snap.data();
        const companyId = typeof data.companyId === 'string'
            ? data.companyId
            : data.managedBy?.companyId;
        if (user.companyId && companyId && user.companyId !== companyId) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        return { id: snap.id, ...data };
    }
    async create(request, user, payload) {
        this.assertManagement(user);
        const companyId = typeof payload.companyId === 'string' ? payload.companyId.trim() : '';
        if (!companyId)
            throw new common_1.BadRequestException('companyId is required');
        if (user.companyId && user.companyId !== companyId) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        await this.enforceRateLimit(request, 'buildings:create', `${user.uid}:${companyId}`, 20);
        const db = this.firebaseAdminService.firestore;
        const existing = await db.collection('buildings').where('companyId', '==', companyId).limit(1).get();
        if (!existing.empty) {
            throw new common_1.BadRequestException('У одного управляющего может быть только один дом');
        }
        const data = {
            ...payload,
            companyId,
            apartmentIds: Array.isArray(payload.apartmentIds) ? payload.apartmentIds : [],
            createdAt: new Date(),
        };
        const ref = db.collection('buildings').doc();
        await ref.set(data);
        return { id: ref.id, ...data };
    }
    async update(request, user, buildingId, payload) {
        this.assertManagement(user);
        if (!buildingId?.trim())
            throw new common_1.BadRequestException('buildingId is required');
        await this.enforceRateLimit(request, 'buildings:update', `${user.uid}:${buildingId}`, 40);
        const db = this.firebaseAdminService.firestore;
        const ref = db.collection('buildings').doc(buildingId);
        const snap = await ref.get();
        if (!snap.exists)
            throw new common_1.NotFoundException('Building not found');
        const current = snap.data();
        const companyId = typeof current.companyId === 'string'
            ? current.companyId
            : current.managedBy?.companyId;
        if (user.companyId && companyId && user.companyId !== companyId) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        await ref.set({ ...payload, updatedAt: new Date() }, { merge: true });
        return { success: true };
    }
    async remove(request, user, buildingId) {
        this.assertManagement(user);
        if (!buildingId?.trim())
            throw new common_1.BadRequestException('buildingId is required');
        await this.enforceRateLimit(request, 'buildings:delete', `${user.uid}:${buildingId}`, 20);
        const db = this.firebaseAdminService.firestore;
        const ref = db.collection('buildings').doc(buildingId);
        const snap = await ref.get();
        if (!snap.exists)
            throw new common_1.NotFoundException('Building not found');
        const current = snap.data();
        const companyId = typeof current.companyId === 'string'
            ? current.companyId
            : current.managedBy?.companyId;
        if (user.companyId && companyId && user.companyId !== companyId) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        await ref.delete();
        return { success: true };
    }
};
exports.BuildingsService = BuildingsService;
exports.BuildingsService = BuildingsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        rate_limit_service_1.RateLimitService])
], BuildingsService);
