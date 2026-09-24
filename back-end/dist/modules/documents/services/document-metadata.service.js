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
exports.DocumentMetadataService = void 0;
const common_1 = require("@nestjs/common");
const firebase_admin_service_1 = require("../../../common/infrastructure/firebase/firebase-admin.service");
const document_helper_service_1 = require("./document-helper.service");
let DocumentMetadataService = class DocumentMetadataService {
    constructor(firebaseAdminService, helperService) {
        this.firebaseAdminService = firebaseAdminService;
        this.helperService = helperService;
    }
    documentMetadataRef(record) {
        const db = this.firebaseAdminService.firestore;
        const scope = this.helperService.firstString(record.scope);
        const apartmentId = this.helperService.firstString(record.apartmentId);
        const companyId = this.helperService.firstString(record.companyId);
        const ownerUserId = this.helperService.firstString(record.ownerUserId);
        const documentId = this.helperService.firstString(record.id);
        if (!documentId) {
            throw new common_1.BadRequestException('documentId is required');
        }
        if (this.helperService.isApartmentScopedDocument(scope) && apartmentId) {
            return db.collection('apartments').doc(apartmentId).collection('documents').doc(documentId);
        }
        if (companyId) {
            return db.collection('companies').doc(companyId).collection('documents').doc(documentId);
        }
        if (ownerUserId) {
            return db.collection('users').doc(ownerUserId).collection('documents').doc(documentId);
        }
        return db.collection('documents').doc(documentId);
    }
    async findDocument(documentId) {
        const normalizedDocumentId = this.helperService.firstString(documentId);
        if (!normalizedDocumentId)
            return null;
        const db = this.firebaseAdminService.firestore;
        const snap = await db
            .collectionGroup('documents')
            .where('id', '==', normalizedDocumentId)
            .limit(10)
            .get();
        if (!snap.empty) {
            const doc = snap.docs[0];
            return { ref: doc.ref, snap: doc };
        }
        const legacyRef = db.collection('documents').doc(normalizedDocumentId);
        const legacySnap = await legacyRef.get();
        return legacySnap.exists ? { ref: legacyRef, snap: legacySnap } : null;
    }
    async getApartment(apartmentId) {
        const snap = await this.firebaseAdminService.firestore.collection('apartments').doc(apartmentId).get();
        if (!snap.exists)
            throw new common_1.NotFoundException('Apartment not found');
        return snap.data();
    }
    async getBuilding(buildingId) {
        const snap = await this.firebaseAdminService.firestore.collection('buildings').doc(buildingId).get();
        if (!snap.exists)
            throw new common_1.NotFoundException('Building not found');
        return snap.data();
    }
    resolveCompanyId(data, fallback) {
        const companyIds = Array.isArray(data.companyIds)
            ? data.companyIds.filter((value) => typeof value === 'string' && value.trim().length > 0)
            : [];
        return this.helperService.firstString(data.companyId, companyIds[0], fallback);
    }
};
exports.DocumentMetadataService = DocumentMetadataService;
exports.DocumentMetadataService = DocumentMetadataService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        document_helper_service_1.DocumentHelperService])
], DocumentMetadataService);
