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
exports.BuildingStorageService = exports.DELETED_BUILDING_STORAGE_RETENTION_DAYS = void 0;
const common_1 = require("@nestjs/common");
const firebase_admin_service_1 = require("../../../common/infrastructure/firebase/firebase-admin.service");
exports.DELETED_BUILDING_STORAGE_RETENTION_DAYS = 180;
let BuildingStorageService = class BuildingStorageService {
    constructor(firebaseAdminService) {
        this.firebaseAdminService = firebaseAdminService;
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
    getBuildingStorageFolders(companyId, buildingId) {
        const base = `companies/${companyId}/buildings/${buildingId}`;
        return [
            base,
            `${base}/apartments`,
            `${base}/invoices`,
            `${base}/documents`,
            `${base}/photos`,
        ];
    }
    getRetentionExpiresAt(deletedAt) {
        return this.addDays(deletedAt, exports.DELETED_BUILDING_STORAGE_RETENTION_DAYS);
    }
    async markStorageFolders(ref, folderPaths, entityLabel) {
        try {
            await this.firebaseAdminService.createStorageFolders(folderPaths);
            await ref.set({
                storageFoldersStatus: 'ready',
                storageFoldersError: null,
                storageFoldersUpdatedAt: new Date(),
            }, { merge: true });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`Failed to create ${entityLabel} storage folders:`, message);
            await ref.set({
                storageFoldersStatus: 'pending',
                storageFoldersError: message,
                storageFoldersUpdatedAt: new Date(),
            }, { merge: true });
        }
    }
    async backupBuildingBeforeDelete(params) {
        const retentionExpiresAt = this.getRetentionExpiresAt(params.deletedAt);
        const backupStamp = params.deletedAt.toISOString().replace(/[:.]/g, '-');
        const sourcePrefix = `companies/${this.sanitizePathSegment(params.companyId)}/buildings/${this.sanitizePathSegment(params.buildingId)}`;
        const backupPrefix = `companies/${this.sanitizePathSegment(params.companyId)}/building_backups/${this.sanitizePathSegment(params.buildingId)}/${backupStamp}`;
        const bucket = this.firebaseAdminService.storageBucket;
        const buildingRef = this.firebaseAdminService.firestore.collection('buildings').doc(params.buildingId);
        const [apartments, documents, subcollections, storageFilesResult] = await Promise.all([
            this.queryBuildingBackupDocs('apartments', params.buildingId, ['buildingId', 'houseId']),
            this.queryBuildingBackupDocs('documents', params.buildingId),
            this.getBuildingSubcollectionBackup(buildingRef),
            bucket.getFiles({ prefix: `${sourcePrefix}/` }),
        ]);
        const storageFiles = storageFilesResult[0];
        const copiedStorageFiles = [];
        await Promise.all(storageFiles.map(async (file) => {
            const relativePath = file.name.slice(`${sourcePrefix}/`.length);
            if (!relativePath) {
                return;
            }
            const destination = `${backupPrefix}/storage/${relativePath}`;
            await file.copy(bucket.file(destination));
            await bucket.file(destination).setMetadata({
                metadata: {
                    backupSourcePath: file.name,
                    retentionExpiresAt: retentionExpiresAt.toISOString(),
                    deletedBuildingId: params.buildingId,
                    deletedCompanyId: params.companyId,
                },
            });
            copiedStorageFiles.push(destination);
        }));
        const backupData = {
            type: 'building-delete-backup',
            buildingId: params.buildingId,
            companyId: params.companyId,
            deletedBy: params.deletedBy,
            deletedAt: params.deletedAt.toISOString(),
            retentionDays: exports.DELETED_BUILDING_STORAGE_RETENTION_DAYS,
            retentionExpiresAt: retentionExpiresAt.toISOString(),
            sourceStoragePrefix: sourcePrefix,
            backupStoragePrefix: backupPrefix,
            building: params.building,
            apartments,
            documents,
            buildingSubcollections: subcollections,
            copiedStorageFiles,
        };
        const metadata = {
            contentType: 'application/json',
            metadata: {
                retentionExpiresAt: retentionExpiresAt.toISOString(),
                deletedBuildingId: params.buildingId,
                deletedCompanyId: params.companyId,
            },
        };
        await bucket.file(`${backupPrefix}/backup.json`).save(JSON.stringify(this.toBackupJson(backupData), null, 2), { resumable: false, metadata });
        await bucket.file(`${sourcePrefix}/.deleted-retention.json`).save(JSON.stringify(this.toBackupJson({
            type: 'deleted-building-retention-marker',
            buildingId: params.buildingId,
            companyId: params.companyId,
            deletedBy: params.deletedBy,
            deletedAt: params.deletedAt,
            retentionDays: exports.DELETED_BUILDING_STORAGE_RETENTION_DAYS,
            retentionExpiresAt,
            backupStoragePrefix: backupPrefix,
        }), null, 2), { resumable: false, metadata });
        return {
            backupStoragePath: `${backupPrefix}/backup.json`,
            backupStoragePrefix: backupPrefix,
            retainedStoragePrefix: sourcePrefix,
            retentionExpiresAt,
            copiedStorageFilesCount: copiedStorageFiles.length,
        };
    }
    sanitizePathSegment(value) {
        return value
            .trim()
            .replace(/[^A-Za-z0-9._-]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 120) || 'unknown';
    }
    addDays(date, days) {
        return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
    }
    toBackupJson(value) {
        if (value instanceof Date) {
            return value.toISOString();
        }
        if (value && typeof value === 'object') {
            const timestamp = value;
            if (typeof timestamp.toDate === 'function') {
                return timestamp.toDate().toISOString();
            }
            if (Array.isArray(value)) {
                return value.map((item) => this.toBackupJson(item));
            }
            return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, this.toBackupJson(item)]));
        }
        return value;
    }
    async queryBuildingBackupDocs(collectionName, buildingId, fields = ['buildingId']) {
        const docs = new Map();
        for (const field of fields) {
            const db = this.firebaseAdminService.firestore;
            const snaps = collectionName === 'documents'
                ? await Promise.all([
                    db.collectionGroup(collectionName).where(field, '==', buildingId).get(),
                    db.collection(collectionName).where(field, '==', buildingId).get(),
                ])
                : [await db.collection(collectionName).where(field, '==', buildingId).get()];
            for (const snap of snaps) {
                for (const doc of snap.docs) {
                    docs.set(doc.ref.path, { id: doc.id, ...doc.data() });
                }
            }
        }
        return Array.from(docs.values());
    }
    async getBuildingSubcollectionBackup(buildingRef) {
        const collections = await buildingRef.listCollections();
        const result = {};
        for (const collection of collections) {
            const snap = await collection.get();
            result[collection.id] = snap.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            }));
        }
        return result;
    }
};
exports.BuildingStorageService = BuildingStorageService;
exports.BuildingStorageService = BuildingStorageService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService])
], BuildingStorageService);
