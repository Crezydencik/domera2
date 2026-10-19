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
var DocumentListService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentListService = void 0;
const common_1 = require("@nestjs/common");
const role_constants_1 = require("../../../common/auth/role.constants");
const firebase_admin_service_1 = require("../../../common/infrastructure/firebase/firebase-admin.service");
const document_access_service_1 = require("./document-access.service");
const document_helper_service_1 = require("./document-helper.service");
const values_1 = require("../../../common/utils/values");
const LIST_LIMIT = 200;
let DocumentListService = DocumentListService_1 = class DocumentListService {
    constructor(firebaseAdminService, accessService, helperService) {
        this.firebaseAdminService = firebaseAdminService;
        this.accessService = accessService;
        this.helperService = helperService;
        this.logger = new common_1.Logger(DocumentListService_1.name);
    }
    async list(user, filters) {
        this.accessService.assertAuthenticated(user);
        const apartmentIdFilter = this.helperService.firstString(filters?.apartmentId);
        const memberApartments = (0, role_constants_1.isPropertyMemberRole)(user.role)
            ? await this.accessService.resolveMemberApartments(user)
            : undefined;
        let candidates;
        if (apartmentIdFilter) {
            candidates = await this.apartmentCandidates(apartmentIdFilter);
        }
        else {
            try {
                candidates = await this.scopedCandidates(user, memberApartments);
            }
            catch (error) {
                if (!this.isMissingIndexError(error))
                    throw error;
                this.logger.warn(`documents.list.index_missing fallback=global reason=${(0, values_1.errorMessage)(error)}`);
                candidates = await this.globalCandidates();
            }
        }
        const items = [];
        const seenDocumentPaths = new Set();
        for (const doc of this.sortNewestFirst(candidates)) {
            if (seenDocumentPaths.has(doc.ref.path))
                continue;
            seenDocumentPaths.add(doc.ref.path);
            const data = doc.data();
            if (apartmentIdFilter && this.helperService.firstString(data.apartmentId) !== apartmentIdFilter) {
                continue;
            }
            if (await this.accessService.canAccessDocument(user, data, memberApartments)) {
                items.push(this.helperService.serializeDocument(doc.id, data));
                if (items.length >= LIST_LIMIT)
                    break;
            }
        }
        return { items };
    }
    async scopedCandidates(user, memberApartments) {
        if ((0, role_constants_1.isPlatformAdminRole)(user.role))
            return this.globalCandidates();
        const db = this.firebaseAdminService.firestore;
        const group = db.collectionGroup('documents');
        const newest = (query) => query.orderBy('createdAt', 'desc').limit(LIST_LIMIT).get().then((snap) => snap.docs);
        const tasks = [
            newest(group.where('ownerUserId', '==', user.uid)),
        ];
        if ((0, role_constants_1.isStaffRole)(user.role)) {
            const companyId = this.helperService.firstString(user.companyId);
            if (companyId) {
                tasks.push(newest(group.where('companyId', '==', companyId)));
                tasks.push(newest(db.collection('documents').where('companyId', '==', companyId)));
            }
        }
        if (memberApartments?.length) {
            for (const apartment of memberApartments) {
                tasks.push(this.apartmentCandidates(apartment.id));
            }
            const buildingIds = Array.from(new Set(memberApartments
                .map((apartment) => this.helperService.firstString(apartment.data.buildingId, apartment.data.houseId))
                .filter(Boolean)));
            for (let index = 0; index < buildingIds.length; index += 30) {
                const chunk = buildingIds.slice(index, index + 30);
                tasks.push(newest(group.where('buildingId', 'in', chunk)));
            }
        }
        return (await Promise.all(tasks)).flat();
    }
    async apartmentCandidates(apartmentId) {
        const db = this.firebaseAdminService.firestore;
        const [snap, legacySnap] = await Promise.all([
            db.collection('apartments').doc(apartmentId).collection('documents')
                .orderBy('createdAt', 'desc')
                .limit(LIST_LIMIT)
                .get(),
            db.collection('documents')
                .where('apartmentId', '==', apartmentId)
                .limit(LIST_LIMIT)
                .get(),
        ]);
        return [...snap.docs, ...legacySnap.docs];
    }
    async globalCandidates() {
        const db = this.firebaseAdminService.firestore;
        const [snap, legacySnap] = await Promise.all([
            db.collectionGroup('documents').orderBy('createdAt', 'desc').limit(LIST_LIMIT).get(),
            db.collection('documents').orderBy('createdAt', 'desc').limit(LIST_LIMIT).get(),
        ]);
        return [...snap.docs, ...legacySnap.docs];
    }
    sortNewestFirst(docs) {
        const millis = (value) => {
            if (value instanceof Date)
                return value.getTime();
            if (value && typeof value === 'object' && typeof value.toMillis === 'function') {
                return value.toMillis();
            }
            if (typeof value === 'string' || typeof value === 'number') {
                const parsed = new Date(value).getTime();
                return Number.isFinite(parsed) ? parsed : 0;
            }
            return 0;
        };
        return [...docs].sort((a, b) => millis(b.data().createdAt) - millis(a.data().createdAt));
    }
    isMissingIndexError(error) {
        const code = error?.code;
        return code === 9 || code === 'failed-precondition' || /requires an index|FAILED_PRECONDITION/i.test((0, values_1.errorMessage)(error));
    }
};
exports.DocumentListService = DocumentListService;
exports.DocumentListService = DocumentListService = DocumentListService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        document_access_service_1.DocumentAccessService,
        document_helper_service_1.DocumentHelperService])
], DocumentListService);
