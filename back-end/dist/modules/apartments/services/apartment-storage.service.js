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
var ApartmentStorageService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApartmentStorageService = void 0;
const common_1 = require("@nestjs/common");
const firestore_1 = require("firebase-admin/firestore");
const firebase_admin_service_1 = require("../../../common/infrastructure/firebase/firebase-admin.service");
let ApartmentStorageService = ApartmentStorageService_1 = class ApartmentStorageService {
    constructor(firebaseAdminService) {
        this.firebaseAdminService = firebaseAdminService;
        this.logger = new common_1.Logger(ApartmentStorageService_1.name);
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
    getApartmentStorageFolders(companyId, buildingId, apartmentId) {
        const base = this.getApartmentStorageFolderPath(companyId, buildingId, apartmentId);
        return [
            base,
            `${base}/invoices`,
            `${base}/documents`,
            `${base}/meter-readings`,
        ];
    }
    getApartmentStorageFolderPath(companyId, buildingId, apartmentId) {
        return `companies/${companyId}/buildings/${buildingId}/apartments/${apartmentId}`;
    }
    resolveApartmentStorageContext(apartmentId, data) {
        const buildingId = typeof data.buildingId === 'string' ? data.buildingId.trim() : '';
        const companyId = typeof data.companyId === 'string' && data.companyId.trim()
            ? data.companyId.trim()
            : Array.isArray(data.companyIds)
                ? data.companyIds.find((value) => typeof value === 'string' && value.trim().length > 0)?.trim() ?? ''
                : '';
        const storageApartmentId = typeof data.storageApartmentId === 'string' && data.storageApartmentId.trim()
            ? data.storageApartmentId.trim()
            : apartmentId;
        if (!companyId || !buildingId) {
            return null;
        }
        return {
            companyId,
            buildingId,
            path: this.getApartmentStorageFolderPath(companyId, buildingId, storageApartmentId),
        };
    }
    async markStorageFolders(ref, folderPaths, entityLabel) {
        try {
            await this.firebaseAdminService.createStorageFolders(folderPaths);
            await ref.set({
                storageFoldersStatus: 'ready',
                storageFoldersError: firestore_1.FieldValue.delete(),
                storageFoldersUpdatedAt: firestore_1.FieldValue.serverTimestamp(),
            }, { merge: true });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`Failed to create ${entityLabel} storage folders`, error instanceof Error ? error.stack : message);
            await ref.set({
                storageFoldersStatus: 'pending',
                storageFoldersError: message,
                storageFoldersUpdatedAt: firestore_1.FieldValue.serverTimestamp(),
            }, { merge: true });
        }
    }
    getStorageFolderSummary(path) {
        return this.firebaseAdminService.getStorageFolderSummary(path);
    }
    deleteStorageFolder(path) {
        return this.firebaseAdminService.deleteStorageFolder(path);
    }
};
exports.ApartmentStorageService = ApartmentStorageService;
exports.ApartmentStorageService = ApartmentStorageService = ApartmentStorageService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService])
], ApartmentStorageService);
