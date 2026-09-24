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
exports.CompanyStorageService = void 0;
const common_1 = require("@nestjs/common");
const firestore_1 = require("firebase-admin/firestore");
const firebase_admin_service_1 = require("../../../common/infrastructure/firebase/firebase-admin.service");
let CompanyStorageService = class CompanyStorageService {
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
    async markStorageFolders(ref, folderPaths) {
        try {
            await this.firebaseAdminService.createStorageFolders(folderPaths);
            await ref.set({
                storageFoldersStatus: 'ready',
                storageFoldersError: firestore_1.FieldValue.delete(),
                storageFoldersUpdatedAt: new Date(),
            }, { merge: true });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('Failed to create company storage folders:', message);
            await ref.set({
                storageFoldersStatus: 'pending',
                storageFoldersError: message,
                storageFoldersUpdatedAt: new Date(),
            }, { merge: true });
        }
    }
};
exports.CompanyStorageService = CompanyStorageService;
exports.CompanyStorageService = CompanyStorageService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService])
], CompanyStorageService);
