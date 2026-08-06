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
exports.DocumentFileService = void 0;
const common_1 = require("@nestjs/common");
const role_constants_1 = require("../../../common/auth/role.constants");
const firebase_admin_service_1 = require("../../../common/infrastructure/firebase/firebase-admin.service");
const document_access_service_1 = require("./document-access.service");
const document_helper_service_1 = require("./document-helper.service");
const document_metadata_service_1 = require("./document-metadata.service");
let DocumentFileService = class DocumentFileService {
    constructor(firebaseAdminService, accessService, helperService, metadataService) {
        this.firebaseAdminService = firebaseAdminService;
        this.accessService = accessService;
        this.helperService = helperService;
        this.metadataService = metadataService;
    }
    async download(user, documentId) {
        this.accessService.assertAuthenticated(user);
        const foundDocument = await this.metadataService.findDocument(documentId);
        if (!foundDocument)
            throw new common_1.NotFoundException('Document not found');
        const data = foundDocument.snap.data();
        if (!(await this.accessService.canAccessDocument(user, data))) {
            throw new common_1.ForbiddenException('Access denied for document');
        }
        const storagePath = this.helperService.firstString(data.storagePath);
        if (!storagePath)
            throw new common_1.NotFoundException('Document file not found');
        const storageBucket = this.helperService.firstString(data.storageBucket);
        const bucket = storageBucket
            ? this.firebaseAdminService.storage.bucket(storageBucket)
            : this.firebaseAdminService.storageBucket;
        const [buffer] = await bucket.file(storagePath).download();
        return {
            buffer,
            fileName: this.helperService.sanitizeFileName(data.fileName),
            contentType: this.helperService.firstString(data.mimeType, 'application/octet-stream'),
        };
    }
    async remove(user, documentId) {
        this.accessService.assertAuthenticated(user);
        const foundDocument = await this.metadataService.findDocument(documentId);
        if (!foundDocument)
            throw new common_1.NotFoundException('Document not found');
        const { ref, snap } = foundDocument;
        const data = snap.data();
        const scope = this.helperService.firstString(data.scope);
        const ownsDocument = this.helperService.firstString(data.ownerUserId) === user.uid;
        const canPlatformAdminManage = scope !== 'privateApartment' &&
            scope !== 'apartmentPrivate' &&
            scope !== 'platformPrivate' &&
            (0, role_constants_1.isPlatformAdminRole)(user.role);
        const canManage = scope !== 'privateApartment' &&
            scope !== 'apartmentPrivate' &&
            scope !== 'platformPrivate' &&
            (0, role_constants_1.isStaffRole)(user.role) &&
            this.helperService.firstString(data.companyId) === this.accessService.requireStaffCompanyId(user);
        if (!ownsDocument && !canPlatformAdminManage && !canManage)
            throw new common_1.ForbiddenException('Access denied for document');
        const storagePath = this.helperService.firstString(data.storagePath);
        const storageBucket = this.helperService.firstString(data.storageBucket);
        await ref.delete();
        if (storagePath) {
            await (storageBucket
                ? this.firebaseAdminService.storage.bucket(storageBucket)
                : this.firebaseAdminService.storageBucket).file(storagePath).delete({ ignoreNotFound: true }).catch(() => null);
        }
        return { success: true };
    }
};
exports.DocumentFileService = DocumentFileService;
exports.DocumentFileService = DocumentFileService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        document_access_service_1.DocumentAccessService,
        document_helper_service_1.DocumentHelperService,
        document_metadata_service_1.DocumentMetadataService])
], DocumentFileService);
