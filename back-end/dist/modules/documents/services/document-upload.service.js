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
var DocumentUploadService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentUploadService = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const role_constants_1 = require("../../../common/auth/role.constants");
const firebase_admin_service_1 = require("../../../common/infrastructure/firebase/firebase-admin.service");
const document_access_service_1 = require("./document-access.service");
const document_helper_service_1 = require("./document-helper.service");
const document_metadata_service_1 = require("./document-metadata.service");
let DocumentUploadService = DocumentUploadService_1 = class DocumentUploadService {
    constructor(firebaseAdminService, accessService, helperService, metadataService) {
        this.firebaseAdminService = firebaseAdminService;
        this.accessService = accessService;
        this.helperService = helperService;
        this.metadataService = metadataService;
        this.logger = new common_1.Logger(DocumentUploadService_1.name);
    }
    async upload(request, user, file, body) {
        void request;
        this.accessService.assertAuthenticated(user);
        this.helperService.validateFile(file);
        const scope = this.helperService.normalizeScope(body.scope);
        const title = this.helperService.firstString(body.title, file.originalname, 'Document');
        const fileName = this.helperService.sanitizeFileName(file.originalname);
        const documentId = `doc_${(0, node_crypto_1.randomUUID)().replace(/-/g, '').slice(0, 18)}`;
        const now = new Date();
        let companyId = this.helperService.firstString(user.companyId);
        let buildingId = '';
        let buildingName = '';
        let apartmentId = '';
        let apartmentLabel = '';
        if (scope === 'platformPrivate') {
            if (!(0, role_constants_1.isPlatformAdminRole)(user.role)) {
                throw new common_1.ForbiddenException('Only platform administrators can create private platform documents');
            }
            companyId = '';
        }
        if (scope === 'managementArchive') {
            if ((0, role_constants_1.isPlatformAdminRole)(user.role)) {
                buildingId = this.helperService.firstString(body.buildingId);
                if (!buildingId)
                    throw new common_1.BadRequestException('buildingId is required');
                const building = await this.metadataService.getBuilding(buildingId);
                companyId = this.metadataService.resolveCompanyId(building, companyId);
                buildingName = this.helperService.firstString(building.name, building.address, buildingId);
            }
            else if ((0, role_constants_1.isStaffRole)(user.role)) {
                if ((0, role_constants_1.isAccountantRole)(user.role)) {
                    buildingId = this.helperService.firstString(body.buildingId);
                    if (buildingId) {
                        const building = await this.metadataService.getBuilding(buildingId);
                        companyId = this.metadataService.resolveCompanyId(building, companyId);
                        buildingName = this.helperService.firstString(building.name, building.address, buildingId);
                    }
                    if (!companyId || this.accessService.requireStaffCompanyId(user) !== companyId) {
                        throw new common_1.ForbiddenException(buildingId ? 'Access denied for building' : 'Company scope is required');
                    }
                }
                else if (!companyId) {
                    throw new common_1.BadRequestException('companyId is required');
                }
            }
            else {
                buildingId = this.helperService.firstString(body.buildingId);
                if (!buildingId)
                    throw new common_1.BadRequestException('buildingId is required');
                const building = await this.metadataService.getBuilding(buildingId);
                companyId = this.metadataService.resolveCompanyId(building, companyId);
                buildingName = this.helperService.firstString(building.name, building.address, buildingId);
                const apartments = await this.accessService.resolveMemberApartments(user);
                const canShareWithManagement = apartments.some((apartment) => this.helperService.firstString(apartment.data.buildingId) === buildingId);
                if (!canShareWithManagement)
                    throw new common_1.ForbiddenException('Access denied for building');
            }
        }
        if (scope === 'buildingResidents') {
            if (!(0, role_constants_1.isStaffRole)(user.role)) {
                throw new common_1.ForbiddenException('Only management company can publish documents to all building residents');
            }
            buildingId = this.helperService.firstString(body.buildingId);
            if (!buildingId)
                throw new common_1.BadRequestException('buildingId is required');
            const building = await this.metadataService.getBuilding(buildingId);
            companyId = this.metadataService.resolveCompanyId(building, companyId);
            buildingName = this.helperService.firstString(building.name, building.address, buildingId);
            if ((0, role_constants_1.isStaffRole)(user.role) && (!companyId || this.accessService.requireStaffCompanyId(user) !== companyId)) {
                throw new common_1.ForbiddenException('Access denied for building');
            }
        }
        if (scope === 'apartmentResidents' || scope === 'apartmentPrivate' || scope === 'privateApartment') {
            if ((scope === 'apartmentPrivate' || scope === 'privateApartment') && (0, role_constants_1.isStaffRole)(user.role)) {
                throw new common_1.ForbiddenException('Management company cannot create private apartment documents');
            }
            apartmentId = this.helperService.firstString(body.apartmentId, user.apartmentId);
            if (!apartmentId)
                throw new common_1.BadRequestException('apartmentId is required');
            const apartment = await this.metadataService.getApartment(apartmentId);
            const apartmentCompanyId = this.metadataService.resolveCompanyId(apartment, companyId);
            const canStaffAttach = scope === 'apartmentResidents'
                && (0, role_constants_1.isStaffRole)(user.role)
                && !(0, role_constants_1.isAccountantRole)(user.role)
                && Boolean(apartmentCompanyId && this.accessService.requireStaffCompanyId(user) === apartmentCompanyId);
            const canMemberAttach = this.accessService.isApartmentMember(apartment, user);
            if (!canStaffAttach && !canMemberAttach)
                throw new common_1.ForbiddenException('Access denied for apartment');
            buildingId = this.helperService.firstString(apartment.buildingId);
            companyId = apartmentCompanyId;
            apartmentLabel = this.helperService.firstString(apartment.number, apartment.apartmentNumber, apartmentId);
        }
        const storagePathBase = companyId
            ? ['companies', this.helperService.sanitizePathSegment(companyId), 'documents']
            : ['users', this.helperService.sanitizePathSegment(user.uid), 'documents'];
        const storagePath = [
            ...storagePathBase,
            this.helperService.sanitizePathSegment(scope),
            documentId,
            this.helperService.sanitizePathSegment(fileName),
        ].join('/');
        const bucket = this.firebaseAdminService.storageBucket;
        try {
            await bucket.file(storagePath).save(file.buffer, {
                resumable: false,
                metadata: {
                    contentType: file.mimetype || 'application/octet-stream',
                    contentDisposition: this.helperService.buildContentDisposition(fileName),
                },
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`documents.upload.storage_failed documentId=${documentId} file=${fileName}: ${message}`);
            throw new common_1.BadRequestException('Could not store document file. Check file name and try again.');
        }
        const record = {
            id: documentId,
            title,
            fileName,
            mimeType: file.mimetype || 'application/octet-stream',
            size: file.size ?? file.buffer.length,
            scope,
            companyId: companyId || undefined,
            buildingId: buildingId || undefined,
            buildingName: buildingName || undefined,
            apartmentId: apartmentId || undefined,
            apartmentLabel: apartmentLabel || undefined,
            ownerUserId: user.uid,
            uploaderRole: user.role,
            storagePath,
            storageBucket: bucket.name,
            createdAt: now,
            updatedAt: now,
        };
        const firestoreRecord = this.helperService.omitUndefined(record);
        try {
            await this.metadataService.documentMetadataRef(firestoreRecord).set(firestoreRecord);
        }
        catch (error) {
            await bucket.file(storagePath).delete({ ignoreNotFound: true }).catch(() => null);
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`documents.upload.firestore_failed documentId=${documentId} file=${fileName}: ${message}`);
            throw new common_1.BadRequestException('Could not save document metadata.');
        }
        return { item: this.helperService.serializeDocument(documentId, firestoreRecord) };
    }
};
exports.DocumentUploadService = DocumentUploadService;
exports.DocumentUploadService = DocumentUploadService = DocumentUploadService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        document_access_service_1.DocumentAccessService,
        document_helper_service_1.DocumentHelperService,
        document_metadata_service_1.DocumentMetadataService])
], DocumentUploadService);
