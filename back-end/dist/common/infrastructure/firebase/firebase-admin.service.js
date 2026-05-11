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
exports.FirebaseAdminService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const app_1 = require("firebase-admin/app");
const auth_1 = require("firebase-admin/auth");
const firestore_1 = require("firebase-admin/firestore");
const storage_1 = require("firebase-admin/storage");
const normalizePrivateKey = (value) => {
    const trimmed = value.trim();
    const unwrapped = (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))
        ? trimmed.slice(1, -1)
        : trimmed;
    return unwrapped.replace(/\\n/g, '\n').trim();
};
let FirebaseAdminService = class FirebaseAdminService {
    constructor(configService) {
        this.configService = configService;
    }
    get auth() {
        return (0, auth_1.getAuth)(this.getApp());
    }
    get firestore() {
        return (0, firestore_1.getFirestore)(this.getApp());
    }
    get storage() {
        return (0, storage_1.getStorage)(this.getApp());
    }
    getBucketName() {
        const bucket = this.configService.get('FIREBASE_STORAGE_BUCKET');
        if (bucket && bucket.trim()) {
            return bucket.trim();
        }
        const projectId = this.configService.get('FIREBASE_PROJECT_ID');
        if (projectId && projectId.trim()) {
            return `${projectId.trim()}.appspot.com`;
        }
        throw new Error('Firebase Storage bucket name is not configured. Set FIREBASE_STORAGE_BUCKET');
    }
    get storageBucket() {
        return this.storage.bucket(this.getBucketName());
    }
    async createStorageFolder(folderPath) {
        const normalized = String(folderPath ?? '').trim().replace(/^\/+|\/+$/g, '');
        if (!normalized) {
            throw new Error('Storage folder path is required');
        }
        const markerPath = `${normalized}/.keep`;
        try {
            await this.storageBucket.file(markerPath).save('', {
                metadata: { contentType: 'application/x-directory' },
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to create storage folder ${folderPath}: ${message}`);
        }
    }
    async createStorageFolders(folderPaths) {
        if (!Array.isArray(folderPaths) || folderPaths.length === 0) {
            return;
        }
        const results = await Promise.allSettled(folderPaths.map((path) => this.createStorageFolder(path)));
        const errors = results
            .map((result, index) => {
            if (result.status === 'rejected') {
                return `${folderPaths[index]}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`;
            }
            return null;
        })
            .filter((error) => error !== null);
        if (errors.length > 0) {
            console.error('Storage folder creation errors:', errors);
            throw new Error(`Failed to create ${errors.length} storage folders: ${errors.join('; ')}`);
        }
    }
    async getStorageFolderSummary(folderPath) {
        const normalized = String(folderPath ?? '').trim().replace(/^\/+|\/+$/g, '');
        if (!normalized) {
            throw new Error('Storage folder path is required');
        }
        const prefix = `${normalized}/`;
        const [files] = await this.storageBucket.getFiles({ prefix });
        const userFiles = files.filter((file) => !file.name.endsWith('/.keep'));
        return {
            path: normalized,
            fileCount: userFiles.length,
            hasUserFiles: userFiles.length > 0,
        };
    }
    async deleteStorageFolder(folderPath) {
        const normalized = String(folderPath ?? '').trim().replace(/^\/+|\/+$/g, '');
        if (!normalized) {
            throw new Error('Storage folder path is required');
        }
        await this.storageBucket.deleteFiles({
            prefix: `${normalized}/`,
            force: true,
        });
        return { path: normalized, deleted: true };
    }
    getApp() {
        if (!this.app) {
            this.app = this.initApp();
        }
        return this.app;
    }
    initApp() {
        if ((0, app_1.getApps)().length > 0) {
            return (0, app_1.getApps)()[0];
        }
        const projectId = this.configService.get('FIREBASE_PROJECT_ID');
        const clientEmail = this.configService.get('FIREBASE_CLIENT_EMAIL');
        const privateKeyRaw = this.configService.get('FIREBASE_PRIVATE_KEY');
        if (!projectId || !clientEmail || !privateKeyRaw) {
            throw new Error('Firebase Admin credentials are missing. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY');
        }
        const privateKey = normalizePrivateKey(privateKeyRaw);
        if (!privateKey.startsWith('-----BEGIN PRIVATE KEY-----')) {
            throw new Error('FIREBASE_PRIVATE_KEY is malformed. Use the service account private key in PEM format.');
        }
        return (0, app_1.initializeApp)({
            credential: (0, app_1.cert)({
                projectId,
                clientEmail,
                privateKey,
            }),
        });
    }
};
exports.FirebaseAdminService = FirebaseAdminService;
exports.FirebaseAdminService = FirebaseAdminService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], FirebaseAdminService);
