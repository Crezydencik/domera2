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
exports.BuildingAdminService = void 0;
const common_1 = require("@nestjs/common");
const firestore_1 = require("firebase-admin/firestore");
const role_constants_1 = require("../../../common/auth/role.constants");
const firebase_admin_service_1 = require("../../../common/infrastructure/firebase/firebase-admin.service");
const rate_limit_service_1 = require("../../../common/services/rate-limit.service");
const building_stats_service_1 = require("./building-stats.service");
let BuildingAdminService = class BuildingAdminService {
    constructor(firebaseAdminService, rateLimitService, buildingStatsService) {
        this.firebaseAdminService = firebaseAdminService;
        this.rateLimitService = rateLimitService;
        this.buildingStatsService = buildingStatsService;
    }
    async listAllForAdmin(request, user) {
        this.assertPlatformAdmin(user);
        await this.enforceRateLimit(request, 'buildings:admin-list-all', user.uid, 50);
        const db = this.firebaseAdminService.firestore;
        const [buildingsSnap, companiesSnap, occupancyStats] = await Promise.all([
            db.collection('buildings').get(),
            db.collection('companies').get(),
            this.buildingStatsService.getAllBuildingOccupancyStats(),
        ]);
        const companies = new Map();
        for (const doc of companiesSnap.docs) {
            companies.set(doc.id, doc.data());
        }
        const items = buildingsSnap.docs.map((doc) => {
            const data = doc.data();
            const managedBy = data.managedBy && typeof data.managedBy === 'object'
                ? data.managedBy
                : {};
            const companyId = this.firstString(data.companyId, managedBy.companyId);
            const company = companyId ? companies.get(companyId) : undefined;
            const companyName = this.firstString(data.companyName, managedBy.companyName, company?.companyName, company?.name, companyId);
            const companyEmail = this.firstString(data.companyEmail, data.contactEmail, managedBy.companyEmail, managedBy.contactEmail, managedBy.email, company?.companyEmail, company?.contactEmail, company?.email);
            const companyPhone = this.firstString(data.companyPhone, data.contactPhone, data.phone, managedBy.companyPhone, managedBy.contactPhone, managedBy.phone, company?.companyPhone, company?.contactPhone, company?.phone);
            const managerName = this.firstString(data.managerName, data.contactName, managedBy.managerName, managedBy.contactName, managedBy.name, company?.managerName, company?.contactName);
            return this.buildingStatsService.applyOccupancyStats(doc.id, {
                ...data,
                companyId,
                companyName,
                companyEmail,
                companyPhone,
                managerName,
                editLocked: data.editLocked === true,
            }, occupancyStats.get(doc.id));
        });
        return { items };
    }
    async listPlatformBillingInvoices(request, user) {
        this.assertPlatformAdmin(user);
        await this.enforceRateLimit(request, 'buildings:admin-billing-invoices', user.uid, 50);
        const db = this.firebaseAdminService.firestore;
        const [buildingsSnap, legacySnap] = await Promise.all([
            db.collection('buildings').get(),
            db.collection('platform_billing_invoices').get(),
        ]);
        const buildingInvoiceSnaps = await Promise.all(buildingsSnap.docs.map((buildingDoc) => buildingDoc.ref.collection('platform_billing_invoices').get()));
        const itemsByPath = new Map();
        for (const doc of [...buildingInvoiceSnaps.flatMap((snap) => snap.docs), ...legacySnap.docs]) {
            itemsByPath.set(doc.ref.path, {
                ...doc.data(),
                id: doc.id,
            });
        }
        return {
            items: Array.from(itemsByPath.values())
                .sort((left, right) => {
                const leftTime = this.dateSortValue(left.createdAt);
                const rightTime = this.dateSortValue(right.createdAt);
                return rightTime - leftTime;
            })
                .slice(0, 500),
        };
    }
    async setEditLock(request, user, buildingId, payload) {
        this.assertPlatformAdmin(user);
        if (!buildingId?.trim())
            throw new common_1.BadRequestException('buildingId is required');
        await this.enforceRateLimit(request, 'buildings:admin-edit-lock', `${user.uid}:${buildingId}`, 40);
        const locked = payload.locked ?? payload.editLocked;
        if (typeof locked !== 'boolean') {
            throw new common_1.BadRequestException('locked must be boolean');
        }
        const db = this.firebaseAdminService.firestore;
        const ref = db.collection('buildings').doc(buildingId);
        const snap = await ref.get();
        if (!snap.exists)
            throw new common_1.NotFoundException('Building not found');
        const updatedAt = new Date();
        await ref.set({
            editLocked: locked,
            editLockedAt: locked ? updatedAt : firestore_1.FieldValue.delete(),
            editLockedBy: locked ? user.uid : firestore_1.FieldValue.delete(),
            updatedAt,
        }, { merge: true });
        return { success: true, buildingId, editLocked: locked };
    }
    assertPlatformAdmin(user) {
        if (!user?.uid)
            throw new common_1.UnauthorizedException('Authentication required');
        if (!(0, role_constants_1.isPlatformAdminRole)(user.role)) {
            throw new common_1.ForbiddenException('Only platform administrators can perform this action');
        }
    }
    async enforceRateLimit(request, scope, discriminator, limit) {
        const rl = await this.rateLimitService.consume(this.rateLimitService.buildKey(request, scope, discriminator), limit, 60_000);
        if (!rl.allowed)
            throw new common_1.BadRequestException('Too many requests');
    }
    firstString(...values) {
        for (const value of values) {
            if (typeof value === 'string' && value.trim()) {
                return value.trim();
            }
        }
        return '';
    }
    dateSortValue(value) {
        if (value instanceof Date) {
            return value.getTime();
        }
        if (value && typeof value === 'object') {
            const timestamp = value;
            if (typeof timestamp.toDate === 'function') {
                return timestamp.toDate().getTime();
            }
            const seconds = typeof timestamp.seconds === 'number' ? timestamp.seconds : timestamp._seconds;
            if (typeof seconds === 'number') {
                return seconds * 1000;
            }
        }
        if (typeof value === 'string' || typeof value === 'number') {
            const time = new Date(value).getTime();
            return Number.isFinite(time) ? time : 0;
        }
        return 0;
    }
};
exports.BuildingAdminService = BuildingAdminService;
exports.BuildingAdminService = BuildingAdminService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        rate_limit_service_1.RateLimitService,
        building_stats_service_1.BuildingStatsService])
], BuildingAdminService);
