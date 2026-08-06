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
exports.DocumentAccessUpdateService = void 0;
const common_1 = require("@nestjs/common");
const role_constants_1 = require("../../../common/auth/role.constants");
const firebase_admin_service_1 = require("../../../common/infrastructure/firebase/firebase-admin.service");
const document_access_service_1 = require("./document-access.service");
const document_helper_service_1 = require("./document-helper.service");
const document_metadata_service_1 = require("./document-metadata.service");
let DocumentAccessUpdateService = class DocumentAccessUpdateService {
    constructor(firebaseAdminService, accessService, helperService, metadataService) {
        this.firebaseAdminService = firebaseAdminService;
        this.accessService = accessService;
        this.helperService = helperService;
        this.metadataService = metadataService;
    }
    async updateAccess(user, documentId, body) {
        this.accessService.assertAuthenticated(user);
        const foundDocument = await this.metadataService.findDocument(documentId);
        if (!foundDocument)
            throw new common_1.NotFoundException('Document not found');
        const { ref, snap } = foundDocument;
        const current = snap.data();
        const currentScope = this.helperService.firstString(current.scope);
        const ownsDocument = this.helperService.firstString(current.ownerUserId) === user.uid;
        const canPlatformAdminManage = currentScope !== 'privateApartment' &&
            currentScope !== 'apartmentPrivate' &&
            currentScope !== 'platformPrivate' &&
            (0, role_constants_1.isPlatformAdminRole)(user.role);
        const canStaffManage = currentScope !== 'privateApartment' &&
            currentScope !== 'apartmentPrivate' &&
            currentScope !== 'platformPrivate' &&
            (0, role_constants_1.isStaffRole)(user.role) &&
            this.helperService.firstString(current.companyId) === this.accessService.requireStaffCompanyId(user);
        if (!ownsDocument && !canPlatformAdminManage && !canStaffManage) {
            throw new common_1.ForbiddenException('Access denied for document');
        }
        const nextScope = this.helperService.normalizeScope(body.scope);
        if (nextScope === 'buildingResidents' && !(0, role_constants_1.isStaffRole)(user.role) && !(0, role_constants_1.isPlatformAdminRole)(user.role)) {
            throw new common_1.ForbiddenException('Only management company can publish documents to all building residents');
        }
        if ((nextScope === 'apartmentPrivate' || nextScope === 'privateApartment') && ((0, role_constants_1.isStaffRole)(user.role) || (0, role_constants_1.isPlatformAdminRole)(user.role))) {
            throw new common_1.ForbiddenException('Management company cannot create private apartment documents');
        }
        if (nextScope === 'platformPrivate' && !(0, role_constants_1.isPlatformAdminRole)(user.role)) {
            throw new common_1.ForbiddenException('Only platform administrators can create private platform documents');
        }
        let companyId = this.helperService.firstString(current.companyId, user.companyId);
        let buildingId = '';
        let buildingName = '';
        let apartmentId = '';
        let apartmentLabel = '';
        if (nextScope === 'buildingResidents') {
            buildingId = this.helperService.firstString(body.buildingId, current.buildingId);
            if (!buildingId)
                throw new common_1.BadRequestException('buildingId is required');
            const building = await this.metadataService.getBuilding(buildingId);
            companyId = this.metadataService.resolveCompanyId(building, companyId);
            buildingName = this.helperService.firstString(building.name, building.address, buildingId);
            if ((0, role_constants_1.isStaffRole)(user.role) && (!companyId || this.accessService.requireStaffCompanyId(user) !== companyId)) {
                throw new common_1.ForbiddenException('Access denied for building');
            }
            if (!(0, role_constants_1.isStaffRole)(user.role)) {
                const apartments = await this.accessService.resolveMemberApartments(user);
                const canShareWithBuilding = apartments.some((apartment) => this.helperService.firstString(apartment.data.buildingId) === buildingId);
                if (!canShareWithBuilding)
                    throw new common_1.ForbiddenException('Access denied for building');
            }
        }
        if (nextScope === 'managementArchive') {
            if ((0, role_constants_1.isPlatformAdminRole)(user.role)) {
                buildingId = this.helperService.firstString(body.buildingId, current.buildingId);
                if (!buildingId)
                    throw new common_1.BadRequestException('buildingId is required');
                const building = await this.metadataService.getBuilding(buildingId);
                companyId = this.metadataService.resolveCompanyId(building, companyId);
                buildingName = this.helperService.firstString(building.name, building.address, buildingId);
            }
            else if ((0, role_constants_1.isStaffRole)(user.role)) {
                if (!companyId && user.companyId)
                    companyId = user.companyId;
            }
            else {
                buildingId = this.helperService.firstString(body.buildingId, current.buildingId);
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
        if (nextScope === 'apartmentResidents' || nextScope === 'apartmentPrivate' || nextScope === 'privateApartment') {
            apartmentId = this.helperService.firstString(body.apartmentId, current.apartmentId, user.apartmentId);
            if (!apartmentId)
                throw new common_1.BadRequestException('apartmentId is required');
            const apartment = await this.metadataService.getApartment(apartmentId);
            const apartmentCompanyId = this.metadataService.resolveCompanyId(apartment, companyId);
            const canStaffAttach = nextScope === 'apartmentResidents'
                && (0, role_constants_1.isStaffRole)(user.role)
                && Boolean(apartmentCompanyId && this.accessService.requireStaffCompanyId(user) === apartmentCompanyId);
            const canMemberAttach = this.accessService.isApartmentMember(apartment, user);
            if (!canStaffAttach && !canMemberAttach)
                throw new common_1.ForbiddenException('Access denied for apartment');
            buildingId = this.helperService.firstString(apartment.buildingId);
            companyId = apartmentCompanyId;
            apartmentLabel = this.helperService.firstString(apartment.number, apartment.apartmentNumber, apartmentId);
        }
        const nextRecord = {
            ...current,
            scope: nextScope,
            companyId: companyId || undefined,
            updatedAt: new Date(),
        };
        delete nextRecord.buildingId;
        delete nextRecord.buildingName;
        delete nextRecord.apartmentId;
        delete nextRecord.apartmentLabel;
        if (nextScope === 'buildingResidents') {
            nextRecord.buildingId = buildingId;
            nextRecord.buildingName = buildingName || undefined;
        }
        if (nextScope === 'apartmentResidents' || nextScope === 'apartmentPrivate' || nextScope === 'privateApartment') {
            nextRecord.buildingId = buildingId || undefined;
            nextRecord.apartmentId = apartmentId;
            nextRecord.apartmentLabel = apartmentLabel || undefined;
        }
        if (nextScope === 'managementArchive') {
            nextRecord.companyId = companyId || user.companyId;
            nextRecord.buildingId = buildingId || undefined;
            nextRecord.buildingName = buildingName || undefined;
        }
        if (nextScope === 'platformPrivate') {
            delete nextRecord.companyId;
        }
        const cleanRecord = this.helperService.omitUndefined(nextRecord);
        const nextRef = this.metadataService.documentMetadataRef(cleanRecord);
        if (nextRef.path === ref.path) {
            await ref.set(cleanRecord);
        }
        else {
            const batch = this.firebaseAdminService.firestore.batch();
            batch.set(nextRef, cleanRecord);
            batch.delete(ref);
            await batch.commit();
        }
        return { item: this.helperService.serializeDocument(documentId, cleanRecord) };
    }
};
exports.DocumentAccessUpdateService = DocumentAccessUpdateService;
exports.DocumentAccessUpdateService = DocumentAccessUpdateService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        document_access_service_1.DocumentAccessService,
        document_helper_service_1.DocumentHelperService,
        document_metadata_service_1.DocumentMetadataService])
], DocumentAccessUpdateService);
