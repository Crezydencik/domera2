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
exports.DocumentListService = void 0;
const common_1 = require("@nestjs/common");
const role_constants_1 = require("../../../common/auth/role.constants");
const firebase_admin_service_1 = require("../../../common/infrastructure/firebase/firebase-admin.service");
const document_access_service_1 = require("./document-access.service");
const document_helper_service_1 = require("./document-helper.service");
let DocumentListService = class DocumentListService {
    constructor(firebaseAdminService, accessService, helperService) {
        this.firebaseAdminService = firebaseAdminService;
        this.accessService = accessService;
        this.helperService = helperService;
    }
    async list(user, filters) {
        this.accessService.assertAuthenticated(user);
        const db = this.firebaseAdminService.firestore;
        const apartmentIdFilter = this.helperService.firstString(filters?.apartmentId);
        const [snap, legacySnap] = apartmentIdFilter
            ? await Promise.all([
                db.collection('apartments')
                    .doc(apartmentIdFilter)
                    .collection('documents')
                    .orderBy('createdAt', 'desc')
                    .limit(200)
                    .get(),
                db.collection('documents')
                    .where('apartmentId', '==', apartmentIdFilter)
                    .limit(200)
                    .get(),
            ])
            : await Promise.all([
                db.collectionGroup('documents')
                    .orderBy('createdAt', 'desc')
                    .limit(200)
                    .get(),
                db.collection('documents')
                    .orderBy('createdAt', 'desc')
                    .limit(200)
                    .get(),
            ]);
        const items = [];
        const seenDocumentPaths = new Set();
        const memberApartments = (0, role_constants_1.isPropertyMemberRole)(user.role)
            ? await this.accessService.resolveMemberApartments(user)
            : undefined;
        for (const doc of [...snap.docs, ...legacySnap.docs]) {
            if (seenDocumentPaths.has(doc.ref.path)) {
                continue;
            }
            seenDocumentPaths.add(doc.ref.path);
            const data = doc.data();
            if (apartmentIdFilter && this.helperService.firstString(data.apartmentId) !== apartmentIdFilter) {
                continue;
            }
            if (await this.accessService.canAccessDocument(user, data, memberApartments)) {
                items.push(this.helperService.serializeDocument(doc.id, data));
            }
        }
        return { items };
    }
};
exports.DocumentListService = DocumentListService;
exports.DocumentListService = DocumentListService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        document_access_service_1.DocumentAccessService,
        document_helper_service_1.DocumentHelperService])
], DocumentListService);
