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
exports.BuildingCrudService = void 0;
const common_1 = require("@nestjs/common");
const firestore_1 = require("firebase-admin/firestore");
const firebase_admin_service_1 = require("../../../common/infrastructure/firebase/firebase-admin.service");
const rate_limit_service_1 = require("../../../common/services/rate-limit.service");
const building_storage_service_1 = require("./building-storage.service");
const building_payload_service_1 = require("./building-payload.service");
const building_stats_service_1 = require("./building-stats.service");
const building_platform_notification_service_1 = require("./building-platform-notification.service");
const company_payload_service_1 = require("../../company/services/company-payload.service");
let BuildingCrudService = class BuildingCrudService {
    constructor(firebaseAdminService, rateLimitService, buildingPayloadService, buildingStorageService, buildingStatsService, platformNotificationService, companyPayloadService) {
        this.firebaseAdminService = firebaseAdminService;
        this.rateLimitService = rateLimitService;
        this.buildingPayloadService = buildingPayloadService;
        this.buildingStorageService = buildingStorageService;
        this.buildingStatsService = buildingStatsService;
        this.platformNotificationService = platformNotificationService;
        this.companyPayloadService = companyPayloadService;
    }
    async list(request, user, companyId) {
        this.assertManagement(user);
        const normalizedCompanyId = companyId?.trim();
        if (!normalizedCompanyId)
            throw new common_1.BadRequestException('companyId is required');
        this.assertManagementCompanyScope(user, normalizedCompanyId);
        await this.enforceRateLimit(request, 'buildings:list', `${user.uid}:${normalizedCompanyId}`, 50);
        const db = this.firebaseAdminService.firestore;
        const [legacySnap, managedBySnap, occupancyStats] = await Promise.all([
            db.collection('buildings').where('companyId', '==', normalizedCompanyId).get(),
            db.collection('buildings').where('managedBy.companyId', '==', normalizedCompanyId).get(),
            this.buildingStatsService.getBuildingOccupancyStats(normalizedCompanyId),
        ]);
        const merged = new Map();
        for (const doc of [...legacySnap.docs, ...managedBySnap.docs]) {
            merged.set(doc.id, doc.data());
        }
        return {
            items: Array.from(merged.entries()).map(([id, data]) => this.buildingStatsService.applyOccupancyStats(id, data, occupancyStats.get(id))),
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
        if (companyId)
            this.assertManagementCompanyScope(user, companyId);
        const occupancyStats = companyId ? await this.buildingStatsService.getBuildingOccupancyStats(companyId) : undefined;
        return this.buildingStatsService.applyOccupancyStats(snap.id, data, occupancyStats?.get(snap.id));
    }
    async create(request, user, payload) {
        this.assertManagement(user);
        this.assertManagementCompanyMutation(user);
        const companyId = typeof payload.companyId === 'string' ? payload.companyId.trim() : '';
        if (!companyId)
            throw new common_1.BadRequestException('companyId is required');
        this.assertManagementCompanyScope(user, companyId);
        await this.enforceRateLimit(request, 'buildings:create', `${user.uid}:${companyId}`, 20);
        throw new common_1.ForbiddenException('Building creation requires an approved building request');
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
        if (companyId)
            this.assertManagementCompanyScope(user, companyId);
        if (!companyId) {
            throw new common_1.BadRequestException('companyId is missing for building');
        }
        await this.assertCanUpdateBuilding(user, companyId, payload);
        if (this.isBuildingCreationRequestStatus(current.status)) {
            const deletedAt = new Date();
            const requestedBy = this.firstString(current.requestedBy);
            const batch = db.batch();
            batch.delete(ref);
            batch.set(db.collection('companies').doc(companyId), {
                ...this.buildCompanyBuildingLinkPatch(buildingId, 'remove', deletedAt),
                buildingCreationRequestStatus: firestore_1.FieldValue.delete(),
                buildingCreationRequestId: firestore_1.FieldValue.delete(),
                buildingCreationRequestBuildingName: firestore_1.FieldValue.delete(),
                buildingCreationRequestBuildingAddress: firestore_1.FieldValue.delete(),
            }, { merge: true });
            if (requestedBy) {
                batch.set(db.collection('users').doc(requestedBy), {
                    buildingCreationRequestStatus: firestore_1.FieldValue.delete(),
                    buildingCreationRequestId: firestore_1.FieldValue.delete(),
                    buildingCreationRequestBuildingName: firestore_1.FieldValue.delete(),
                    buildingCreationRequestBuildingAddress: firestore_1.FieldValue.delete(),
                    updatedAt: deletedAt,
                }, { merge: true });
            }
            await this.platformNotificationService.markCreationRequestNotificationsRead(batch, buildingId, deletedAt);
            await batch.commit();
            return { success: true, deletedRequest: true };
        }
        if (current.editLocked === true) {
            throw new common_1.ForbiddenException('This building is locked by the platform administrator');
        }
        const companySummary = await this.getCompanySummary(companyId);
        const normalizedPayload = this.buildingPayloadService.normalizeBuildingPayload(payload, companyId, companySummary, current);
        const updatedAt = new Date();
        const batch = db.batch();
        batch.set(ref, { ...normalizedPayload, updatedAt }, { merge: true });
        const normalizedStatus = this.firstString(normalizedPayload.status).toLowerCase();
        if (!['pending', 'rejected', 'cancelled', 'canceled'].includes(normalizedStatus)) {
            batch.set(db.collection('companies').doc(companyId), this.buildCompanyBuildingLinkPatch(buildingId, 'add', updatedAt), { merge: true });
        }
        await batch.commit();
        return { success: true };
    }
    async remove(request, user, buildingId) {
        this.assertManagement(user);
        this.assertManagementCompanyMutation(user);
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
        if (companyId)
            this.assertManagementCompanyScope(user, companyId);
        if (!companyId) {
            throw new common_1.BadRequestException('companyId is missing for building');
        }
        if (this.isBuildingCreationRequestStatus(current.status)) {
            const deletedAt = new Date();
            const requestedBy = this.firstString(current.requestedBy);
            const batch = db.batch();
            batch.delete(ref);
            batch.set(db.collection('companies').doc(companyId), {
                ...this.buildCompanyBuildingLinkPatch(buildingId, 'remove', deletedAt),
                buildingCreationRequestStatus: firestore_1.FieldValue.delete(),
                buildingCreationRequestId: firestore_1.FieldValue.delete(),
                buildingCreationRequestBuildingName: firestore_1.FieldValue.delete(),
                buildingCreationRequestBuildingAddress: firestore_1.FieldValue.delete(),
            }, { merge: true });
            if (requestedBy) {
                batch.set(db.collection('users').doc(requestedBy), {
                    buildingCreationRequestStatus: firestore_1.FieldValue.delete(),
                    buildingCreationRequestId: firestore_1.FieldValue.delete(),
                    buildingCreationRequestBuildingName: firestore_1.FieldValue.delete(),
                    buildingCreationRequestBuildingAddress: firestore_1.FieldValue.delete(),
                    updatedAt: deletedAt,
                }, { merge: true });
            }
            await this.platformNotificationService.markCreationRequestNotificationsRead(batch, buildingId, deletedAt);
            await batch.commit();
            return { success: true, deletedRequest: true };
        }
        if (current.editLocked === true) {
            throw new common_1.ForbiddenException('This building is locked by the platform administrator');
        }
        if (await this.buildingStatsService.buildingHasLinkedApartments(buildingId)) {
            throw new common_1.ConflictException('Cannot delete building while apartments are linked to it');
        }
        const deletedAt = new Date();
        let backup;
        try {
            backup = await this.buildingStorageService.backupBuildingBeforeDelete({
                buildingId,
                companyId,
                building: current,
                deletedBy: user.uid,
                deletedAt,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`Failed to create delete backup for building ${buildingId}:`, message);
            backup = {
                backupStoragePath: null,
                backupStoragePrefix: null,
                retainedStoragePrefix: null,
                retentionExpiresAt: this.buildingStorageService.getRetentionExpiresAt(deletedAt),
                copiedStorageFilesCount: 0,
                backupFailed: true,
                backupError: message,
            };
        }
        const batch = db.batch();
        batch.delete(ref);
        batch.set(db.collection('companies').doc(companyId), {
            ...this.buildCompanyBuildingLinkPatch(buildingId, 'remove', deletedAt),
            lastDeletedBuildingBackup: {
                buildingId,
                deletedAt,
                deletedBy: user.uid,
                backupStoragePath: backup.backupStoragePath,
                backupStoragePrefix: backup.backupStoragePrefix,
                retainedStoragePrefix: backup.retainedStoragePrefix,
                retentionDays: building_storage_service_1.DELETED_BUILDING_STORAGE_RETENTION_DAYS,
                retentionExpiresAt: backup.retentionExpiresAt,
                backupFailed: backup.backupFailed === true,
                backupError: backup.backupError ?? null,
            },
        }, { merge: true });
        batch.set(db.collection('companies')
            .doc(companyId)
            .collection('building_delete_backups')
            .doc(buildingId), {
            buildingId,
            deletedAt,
            deletedBy: user.uid,
            backupStoragePath: backup.backupStoragePath,
            backupStoragePrefix: backup.backupStoragePrefix,
            retainedStoragePrefix: backup.retainedStoragePrefix,
            copiedStorageFilesCount: backup.copiedStorageFilesCount,
            retentionDays: building_storage_service_1.DELETED_BUILDING_STORAGE_RETENTION_DAYS,
            retentionExpiresAt: backup.retentionExpiresAt,
            backupFailed: backup.backupFailed === true,
            backupError: backup.backupError ?? null,
        }, { merge: true });
        await batch.commit();
        return { success: true, backup };
    }
    assertManagement(user) {
        if (!user?.uid || !user.role)
            throw new common_1.UnauthorizedException('Authentication required');
        if (!['ManagementCompany', 'Accountant'].includes(user.role)) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
    }
    assertManagementCompanyMutation(user) {
        if (user.role !== 'ManagementCompany') {
            throw new common_1.ForbiddenException('Only management company users can change buildings');
        }
    }
    async assertCanUpdateBuilding(user, companyId, payload) {
        if (user.role === 'ManagementCompany')
            return;
        if (user.role !== 'Accountant') {
            throw new common_1.ForbiddenException('Only management company users can change buildings');
        }
        const payloadKeys = Object.keys(payload);
        if (payloadKeys.length !== 1 || !Object.prototype.hasOwnProperty.call(payload, 'buildingMainMeterEntries')) {
            throw new common_1.ForbiddenException('Only management company users can change buildings');
        }
        const companySnap = await this.firebaseAdminService.firestore.collection('companies').doc(companyId).get();
        if (!companySnap.exists) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        const permissions = this.companyPayloadService.getCompanyMemberPermissions(companySnap.data(), user.uid);
        if (!permissions.manageMeterReadings && !permissions.manageMeterReadingData) {
            throw new common_1.ForbiddenException('You do not have permission to edit meter readings');
        }
    }
    effectiveManagementCompanyId(user) {
        const companyId = this.firstString(user.companyId);
        if (companyId)
            return companyId;
        if (user.role === 'ManagementCompany')
            return user.uid;
        throw new common_1.ForbiddenException('Company scope is required');
    }
    assertManagementCompanyScope(user, companyId) {
        if (this.effectiveManagementCompanyId(user) !== companyId) {
            throw new common_1.ForbiddenException('Access denied for company');
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
    isBuildingCreationRequestStatus(value) {
        const normalized = String(value ?? '').trim().toLowerCase();
        return normalized === 'pending' || normalized === 'rejected' || normalized === 'cancelled' || normalized === 'canceled';
    }
    async getCompanySummary(companyId) {
        const snap = await this.firebaseAdminService.firestore.collection('companies').doc(companyId).get();
        const data = snap.exists ? snap.data() : {};
        return {
            companyId,
            companyName: this.firstString(data.companyName, data.name) || companyId,
            companyEmail: this.firstString(data.companyEmail, data.contactEmail, data.email) || undefined,
            companyPhone: this.firstString(data.companyPhone, data.contactPhone, data.phone) || undefined,
        };
    }
    buildCompanyBuildingLinkPatch(buildingId, operation, updatedAt = new Date()) {
        return {
            buildings: operation === 'add' ? firestore_1.FieldValue.arrayUnion(buildingId) : firestore_1.FieldValue.arrayRemove(buildingId),
            buildingIds: firestore_1.FieldValue.delete(),
            updatedAt,
        };
    }
};
exports.BuildingCrudService = BuildingCrudService;
exports.BuildingCrudService = BuildingCrudService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        rate_limit_service_1.RateLimitService,
        building_payload_service_1.BuildingPayloadService,
        building_storage_service_1.BuildingStorageService,
        building_stats_service_1.BuildingStatsService,
        building_platform_notification_service_1.BuildingPlatformNotificationService,
        company_payload_service_1.CompanyPayloadService])
], BuildingCrudService);
