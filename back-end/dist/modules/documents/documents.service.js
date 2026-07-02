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
var DocumentsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentsService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const role_constants_1 = require("../../common/auth/role.constants");
const firebase_admin_service_1 = require("../../common/infrastructure/firebase/firebase-admin.service");
const DOCUMENT_SCOPES = new Set([
    'buildingResidents',
    'apartmentResidents',
    'apartmentPrivate',
    'privateApartment',
    'platformPrivate',
    'managementArchive',
]);
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
]);
let DocumentsService = DocumentsService_1 = class DocumentsService {
    constructor(firebaseAdminService) {
        this.firebaseAdminService = firebaseAdminService;
        this.logger = new common_1.Logger(DocumentsService_1.name);
    }
    assertAuthenticated(user) {
        if (!user?.uid || !user.role)
            throw new common_1.UnauthorizedException('Authentication required');
    }
    requireStaffCompanyId(user) {
        const companyId = this.firstString(user.companyId);
        if (!companyId)
            throw new common_1.ForbiddenException('Company scope is required');
        return companyId;
    }
    firstString(...values) {
        for (const value of values) {
            if (typeof value === 'string' && value.trim())
                return value.trim();
            if (typeof value === 'number' && Number.isFinite(value))
                return String(value);
        }
        return '';
    }
    normalizeScope(value) {
        const raw = this.firstString(value);
        if (!DOCUMENT_SCOPES.has(raw)) {
            throw new common_1.BadRequestException('Invalid document scope');
        }
        return raw;
    }
    sanitizeFileName(value) {
        const name = this.firstString(value, 'document');
        return name.replace(/[/\\?%*:|"<>]/g, '_').trim().slice(0, 180) || 'document';
    }
    buildAsciiDownloadFileName(value) {
        const sanitized = this.sanitizeFileName(value);
        const ascii = sanitized
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^\x20-\x7E]+/g, '_')
            .replace(/[";]/g, '_')
            .replace(/\s+/g, ' ')
            .trim();
        return ascii || 'document';
    }
    buildContentDisposition(fileName) {
        const asciiName = this.buildAsciiDownloadFileName(fileName);
        return `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
    }
    sanitizePathSegment(value) {
        return value
            .trim()
            .replace(/[^A-Za-z0-9._-]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 120) || 'unknown';
    }
    formatDate(value) {
        if (value instanceof Date)
            return value.toISOString();
        if (value && typeof value === 'object') {
            const record = value;
            if (typeof record.toDate === 'function')
                return record.toDate().toISOString();
            const seconds = typeof record.seconds === 'number' ? record.seconds : record._seconds;
            if (typeof seconds === 'number')
                return new Date(seconds * 1000).toISOString();
        }
        if (typeof value === 'string' && value.trim())
            return value;
        return new Date().toISOString();
    }
    parseOptionalDate(value) {
        if (value instanceof Date && !Number.isNaN(value.getTime()))
            return value;
        if (value && typeof value === 'object') {
            const record = value;
            if (typeof record.toDate === 'function') {
                const date = record.toDate();
                return Number.isNaN(date.getTime()) ? null : date;
            }
            const seconds = typeof record.seconds === 'number' ? record.seconds : record._seconds;
            if (typeof seconds === 'number')
                return new Date(seconds * 1000);
        }
        if (typeof value === 'string' && value.trim()) {
            const date = new Date(value);
            return Number.isNaN(date.getTime()) ? null : date;
        }
        return null;
    }
    omitUndefined(input) {
        return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
    }
    isApartmentScopedDocument(scope) {
        return ['apartmentResidents', 'apartmentPrivate', 'privateApartment'].includes(this.firstString(scope));
    }
    documentMetadataRef(record) {
        const db = this.firebaseAdminService.firestore;
        const scope = this.firstString(record.scope);
        const apartmentId = this.firstString(record.apartmentId);
        const companyId = this.firstString(record.companyId);
        const ownerUserId = this.firstString(record.ownerUserId);
        const documentId = this.firstString(record.id);
        if (!documentId) {
            throw new common_1.BadRequestException('documentId is required');
        }
        if (this.isApartmentScopedDocument(scope) && apartmentId) {
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
        const normalizedDocumentId = this.firstString(documentId);
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
    validateFile(file) {
        const size = file.size ?? file.buffer?.length ?? 0;
        if (!file.buffer || size <= 0) {
            throw new common_1.BadRequestException('File is required');
        }
        if (size > MAX_DOCUMENT_BYTES) {
            throw new common_1.BadRequestException('Document file is too large');
        }
        const mimeType = this.firstString(file.mimetype).toLowerCase();
        if (!ALLOWED_MIME_TYPES.has(mimeType)) {
            throw new common_1.BadRequestException('Only PDF, DOC, DOCX, JPG, and PNG files are allowed');
        }
    }
    isApartmentMember(apartment, user) {
        const ownerEmail = this.firstString(apartment.ownerEmail).toLowerCase();
        const userEmail = this.firstString(user.email).toLowerCase();
        const tenants = Array.isArray(apartment.tenants) ? apartment.tenants : [];
        const isTenantActive = (tenant) => {
            const fromDate = typeof tenant.fromDate === 'string' ? new Date(tenant.fromDate) : null;
            const until = typeof tenant.until === 'string' ? new Date(tenant.until) : null;
            const now = new Date();
            if (fromDate && now < fromDate)
                return false;
            if (until && now > until)
                return false;
            return true;
        };
        return (this.firstString(apartment.residentId) === user.uid ||
            this.firstString(apartment.ownerId) === user.uid ||
            Boolean(userEmail && ownerEmail && ownerEmail === userEmail && apartment.ownerActivated === true) ||
            tenants.some((tenant) => {
                if (!tenant || typeof tenant !== 'object')
                    return false;
                const record = tenant;
                const hasMatch = this.firstString(record.userId) === user.uid || this.firstString(record.email).toLowerCase() === userEmail;
                return hasMatch && isTenantActive(record);
            }));
    }
    memberAccessForApartment(apartment, user) {
        const ownerEmail = this.firstString(apartment.ownerEmail).toLowerCase();
        const userEmail = this.firstString(user.email).toLowerCase();
        if (this.firstString(apartment.residentId) === user.uid)
            return { type: 'resident' };
        if (this.firstString(apartment.ownerId) === user.uid)
            return { type: 'owner' };
        if (userEmail && ownerEmail && ownerEmail === userEmail && apartment.ownerActivated === true)
            return { type: 'owner' };
        const tenants = Array.isArray(apartment.tenants) ? apartment.tenants : [];
        for (const tenant of tenants) {
            if (!tenant || typeof tenant !== 'object')
                continue;
            const record = tenant;
            const tenantEmail = this.firstString(record.email).toLowerCase();
            const matches = this.firstString(record.userId) === user.uid || Boolean(userEmail && tenantEmail === userEmail);
            if (!matches)
                continue;
            return {
                type: 'tenant',
                fromDate: this.parseOptionalDate(record.fromDate),
                until: this.parseOptionalDate(record.until),
                canViewDocuments: Array.isArray(record.permissions) &&
                    record.permissions.some((permission) => ['viewDocuments', 'documents'].includes(this.firstString(permission))),
            };
        }
        return null;
    }
    documentVisibleForApartmentAccess(user, apartment, document) {
        if (this.firstString(document.ownerUserId) === user.uid)
            return true;
        const access = this.memberAccessForApartment(apartment.data, user);
        if (!access)
            return false;
        if (access.type !== 'tenant')
            return true;
        return access.canViewDocuments === true;
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
        return this.firstString(data.companyId, companyIds[0], fallback);
    }
    async resolveMemberApartments(user) {
        const db = this.firebaseAdminService.firestore;
        const apartmentMap = new Map();
        const userEmail = this.firstString(user.email).toLowerCase();
        const userSnap = await db.collection('users').doc(user.uid).get();
        const userData = userSnap.exists ? userSnap.data() : {};
        const apartmentIds = new Set();
        const addApartmentId = (value) => {
            const apartmentId = this.firstString(value);
            if (apartmentId)
                apartmentIds.add(apartmentId);
        };
        addApartmentId(user.apartmentId);
        addApartmentId(userData.apartmentId);
        if (Array.isArray(userData.apartmentIds)) {
            userData.apartmentIds.forEach(addApartmentId);
        }
        const addSnap = (snap) => {
            for (const doc of snap.docs)
                apartmentMap.set(doc.id, doc.data());
        };
        const apartmentRefs = Array.from(apartmentIds).map((id) => db.collection('apartments').doc(id));
        const directSnaps = apartmentRefs.length > 0 ? await db.getAll(...apartmentRefs) : [];
        for (const snap of directSnaps) {
            if (snap.exists)
                apartmentMap.set(snap.id, snap.data());
        }
        await Promise.all([
            db.collection('apartments').where('residentId', '==', user.uid).get().then(addSnap),
            db.collection('apartments').where('ownerId', '==', user.uid).get().then(addSnap),
            userEmail ? db.collection('apartments').where('ownerEmail', '==', userEmail).get().then(addSnap) : Promise.resolve(),
        ]);
        return Array.from(apartmentMap.entries()).map(([id, data]) => ({ id, data }));
    }
    async canAccessDocument(user, document, memberApartments) {
        const scope = this.firstString(document.scope);
        if (this.firstString(document.ownerUserId) === user.uid)
            return true;
        if (scope === 'platformPrivate')
            return false;
        if ((0, role_constants_1.isPlatformAdminRole)(user.role))
            return true;
        if (scope === 'privateApartment') {
            return this.firstString(document.ownerUserId) === user.uid;
        }
        if (scope === 'apartmentPrivate') {
            if ((0, role_constants_1.isStaffRole)(user.role) || !(0, role_constants_1.isPropertyMemberRole)(user.role))
                return false;
            const apartmentId = this.firstString(document.apartmentId);
            const apartments = memberApartments ?? await this.resolveMemberApartments(user);
            return apartments.some((apartment) => apartment.id === apartmentId && this.documentVisibleForApartmentAccess(user, apartment, document));
        }
        if ((0, role_constants_1.isStaffRole)(user.role)) {
            const companyId = this.firstString(document.companyId);
            return Boolean(companyId && this.requireStaffCompanyId(user) === companyId);
        }
        if (!(0, role_constants_1.isPropertyMemberRole)(user.role))
            return false;
        if (scope === 'managementArchive')
            return false;
        const apartments = memberApartments ?? await this.resolveMemberApartments(user);
        if (scope === 'apartmentResidents') {
            const apartmentId = this.firstString(document.apartmentId);
            return apartments.some((apartment) => apartment.id === apartmentId && this.documentVisibleForApartmentAccess(user, apartment, document));
        }
        const buildingId = this.firstString(document.buildingId);
        return apartments.some((apartment) => this.firstString(apartment.data.buildingId) === buildingId &&
            this.documentVisibleForApartmentAccess(user, apartment, document));
    }
    serializeDocument(id, data) {
        return {
            id,
            title: this.firstString(data.title, data.fileName, 'Document'),
            fileName: this.firstString(data.fileName, 'document'),
            mimeType: this.firstString(data.mimeType, 'application/octet-stream'),
            size: Number(data.size) || 0,
            scope: this.firstString(data.scope, 'managementArchive'),
            companyId: this.firstString(data.companyId) || undefined,
            buildingId: this.firstString(data.buildingId) || undefined,
            buildingName: this.firstString(data.buildingName) || undefined,
            apartmentId: this.firstString(data.apartmentId) || undefined,
            apartmentLabel: this.firstString(data.apartmentLabel) || undefined,
            ownerUserId: this.firstString(data.ownerUserId) || undefined,
            uploaderRole: this.firstString(data.uploaderRole) || undefined,
            uploadedAt: this.formatDate(data.createdAt ?? data.updatedAt),
            updatedAt: this.formatDate(data.updatedAt ?? data.createdAt),
            downloadUrl: `/documents/${encodeURIComponent(id)}/download`,
        };
    }
    async list(user, filters) {
        this.assertAuthenticated(user);
        const db = this.firebaseAdminService.firestore;
        const apartmentIdFilter = this.firstString(filters?.apartmentId);
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
            ? await this.resolveMemberApartments(user)
            : undefined;
        for (const doc of [...snap.docs, ...legacySnap.docs]) {
            if (seenDocumentPaths.has(doc.ref.path)) {
                continue;
            }
            seenDocumentPaths.add(doc.ref.path);
            const data = doc.data();
            if (apartmentIdFilter && this.firstString(data.apartmentId) !== apartmentIdFilter) {
                continue;
            }
            if (await this.canAccessDocument(user, data, memberApartments)) {
                items.push(this.serializeDocument(doc.id, data));
            }
        }
        return { items };
    }
    async upload(request, user, file, body) {
        void request;
        this.assertAuthenticated(user);
        this.validateFile(file);
        const scope = this.normalizeScope(body.scope);
        const title = this.firstString(body.title, file.originalname, 'Document');
        const fileName = this.sanitizeFileName(file.originalname);
        const documentId = `doc_${(0, node_crypto_1.randomUUID)().replace(/-/g, '').slice(0, 18)}`;
        const now = new Date();
        let companyId = this.firstString(user.companyId);
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
                buildingId = this.firstString(body.buildingId);
                if (!buildingId)
                    throw new common_1.BadRequestException('buildingId is required');
                const building = await this.getBuilding(buildingId);
                companyId = this.resolveCompanyId(building, companyId);
                buildingName = this.firstString(building.name, building.address, buildingId);
            }
            else if ((0, role_constants_1.isStaffRole)(user.role)) {
                if (!companyId)
                    throw new common_1.BadRequestException('companyId is required');
            }
            else {
                buildingId = this.firstString(body.buildingId);
                if (!buildingId)
                    throw new common_1.BadRequestException('buildingId is required');
                const building = await this.getBuilding(buildingId);
                companyId = this.resolveCompanyId(building, companyId);
                buildingName = this.firstString(building.name, building.address, buildingId);
                const apartments = await this.resolveMemberApartments(user);
                const canShareWithManagement = apartments.some((apartment) => this.firstString(apartment.data.buildingId) === buildingId);
                if (!canShareWithManagement)
                    throw new common_1.ForbiddenException('Access denied for building');
            }
        }
        if (scope === 'buildingResidents') {
            if (!(0, role_constants_1.isStaffRole)(user.role)) {
                throw new common_1.ForbiddenException('Only management company can publish documents to all building residents');
            }
            buildingId = this.firstString(body.buildingId);
            if (!buildingId)
                throw new common_1.BadRequestException('buildingId is required');
            const building = await this.getBuilding(buildingId);
            companyId = this.resolveCompanyId(building, companyId);
            buildingName = this.firstString(building.name, building.address, buildingId);
            if ((0, role_constants_1.isStaffRole)(user.role) && (!companyId || this.requireStaffCompanyId(user) !== companyId)) {
                throw new common_1.ForbiddenException('Access denied for building');
            }
        }
        if (scope === 'apartmentResidents' || scope === 'apartmentPrivate' || scope === 'privateApartment') {
            if ((scope === 'apartmentPrivate' || scope === 'privateApartment') && (0, role_constants_1.isStaffRole)(user.role)) {
                throw new common_1.ForbiddenException('Management company cannot create private apartment documents');
            }
            apartmentId = this.firstString(body.apartmentId, user.apartmentId);
            if (!apartmentId)
                throw new common_1.BadRequestException('apartmentId is required');
            const apartment = await this.getApartment(apartmentId);
            const apartmentCompanyId = this.resolveCompanyId(apartment, companyId);
            const canStaffAttach = scope === 'apartmentResidents'
                && (0, role_constants_1.isStaffRole)(user.role)
                && Boolean(apartmentCompanyId && this.requireStaffCompanyId(user) === apartmentCompanyId);
            const canMemberAttach = this.isApartmentMember(apartment, user);
            if (!canStaffAttach && !canMemberAttach)
                throw new common_1.ForbiddenException('Access denied for apartment');
            buildingId = this.firstString(apartment.buildingId);
            companyId = apartmentCompanyId;
            apartmentLabel = this.firstString(apartment.number, apartment.apartmentNumber, apartmentId);
        }
        const storagePathBase = companyId
            ? ['companies', this.sanitizePathSegment(companyId), 'documents']
            : ['users', this.sanitizePathSegment(user.uid), 'documents'];
        const storagePath = [
            ...storagePathBase,
            this.sanitizePathSegment(scope),
            documentId,
            this.sanitizePathSegment(fileName),
        ].join('/');
        const bucket = this.firebaseAdminService.storageBucket;
        try {
            await bucket.file(storagePath).save(file.buffer, {
                resumable: false,
                metadata: {
                    contentType: file.mimetype || 'application/octet-stream',
                    contentDisposition: this.buildContentDisposition(fileName),
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
        const firestoreRecord = this.omitUndefined(record);
        try {
            await this.documentMetadataRef(firestoreRecord).set(firestoreRecord);
        }
        catch (error) {
            await bucket.file(storagePath).delete({ ignoreNotFound: true }).catch(() => null);
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`documents.upload.firestore_failed documentId=${documentId} file=${fileName}: ${message}`);
            throw new common_1.BadRequestException('Could not save document metadata.');
        }
        return { item: this.serializeDocument(documentId, firestoreRecord) };
    }
    async updateAccess(user, documentId, body) {
        this.assertAuthenticated(user);
        const foundDocument = await this.findDocument(documentId);
        if (!foundDocument)
            throw new common_1.NotFoundException('Document not found');
        const { ref, snap } = foundDocument;
        const current = snap.data();
        const currentScope = this.firstString(current.scope);
        const ownsDocument = this.firstString(current.ownerUserId) === user.uid;
        const canPlatformAdminManage = currentScope !== 'privateApartment' &&
            currentScope !== 'apartmentPrivate' &&
            currentScope !== 'platformPrivate' &&
            (0, role_constants_1.isPlatformAdminRole)(user.role);
        const canStaffManage = currentScope !== 'privateApartment' &&
            currentScope !== 'apartmentPrivate' &&
            currentScope !== 'platformPrivate' &&
            (0, role_constants_1.isStaffRole)(user.role) &&
            this.firstString(current.companyId) === this.requireStaffCompanyId(user);
        if (!ownsDocument && !canPlatformAdminManage && !canStaffManage) {
            throw new common_1.ForbiddenException('Access denied for document');
        }
        const nextScope = this.normalizeScope(body.scope);
        if (nextScope === 'buildingResidents' && !(0, role_constants_1.isStaffRole)(user.role) && !(0, role_constants_1.isPlatformAdminRole)(user.role)) {
            throw new common_1.ForbiddenException('Only management company can publish documents to all building residents');
        }
        if ((nextScope === 'apartmentPrivate' || nextScope === 'privateApartment') && ((0, role_constants_1.isStaffRole)(user.role) || (0, role_constants_1.isPlatformAdminRole)(user.role))) {
            throw new common_1.ForbiddenException('Management company cannot create private apartment documents');
        }
        if (nextScope === 'platformPrivate' && !(0, role_constants_1.isPlatformAdminRole)(user.role)) {
            throw new common_1.ForbiddenException('Only platform administrators can create private platform documents');
        }
        let companyId = this.firstString(current.companyId, user.companyId);
        let buildingId = '';
        let buildingName = '';
        let apartmentId = '';
        let apartmentLabel = '';
        if (nextScope === 'buildingResidents') {
            buildingId = this.firstString(body.buildingId, current.buildingId);
            if (!buildingId)
                throw new common_1.BadRequestException('buildingId is required');
            const building = await this.getBuilding(buildingId);
            companyId = this.resolveCompanyId(building, companyId);
            buildingName = this.firstString(building.name, building.address, buildingId);
            if ((0, role_constants_1.isStaffRole)(user.role) && (!companyId || this.requireStaffCompanyId(user) !== companyId)) {
                throw new common_1.ForbiddenException('Access denied for building');
            }
            if (!(0, role_constants_1.isStaffRole)(user.role)) {
                const apartments = await this.resolveMemberApartments(user);
                const canShareWithBuilding = apartments.some((apartment) => this.firstString(apartment.data.buildingId) === buildingId);
                if (!canShareWithBuilding)
                    throw new common_1.ForbiddenException('Access denied for building');
            }
        }
        if (nextScope === 'managementArchive') {
            if ((0, role_constants_1.isPlatformAdminRole)(user.role)) {
                buildingId = this.firstString(body.buildingId, current.buildingId);
                if (!buildingId)
                    throw new common_1.BadRequestException('buildingId is required');
                const building = await this.getBuilding(buildingId);
                companyId = this.resolveCompanyId(building, companyId);
                buildingName = this.firstString(building.name, building.address, buildingId);
            }
            else if ((0, role_constants_1.isStaffRole)(user.role)) {
                if (!companyId && user.companyId)
                    companyId = user.companyId;
            }
            else {
                buildingId = this.firstString(body.buildingId, current.buildingId);
                if (!buildingId)
                    throw new common_1.BadRequestException('buildingId is required');
                const building = await this.getBuilding(buildingId);
                companyId = this.resolveCompanyId(building, companyId);
                buildingName = this.firstString(building.name, building.address, buildingId);
                const apartments = await this.resolveMemberApartments(user);
                const canShareWithManagement = apartments.some((apartment) => this.firstString(apartment.data.buildingId) === buildingId);
                if (!canShareWithManagement)
                    throw new common_1.ForbiddenException('Access denied for building');
            }
        }
        if (nextScope === 'apartmentResidents' || nextScope === 'apartmentPrivate' || nextScope === 'privateApartment') {
            apartmentId = this.firstString(body.apartmentId, current.apartmentId, user.apartmentId);
            if (!apartmentId)
                throw new common_1.BadRequestException('apartmentId is required');
            const apartment = await this.getApartment(apartmentId);
            const apartmentCompanyId = this.resolveCompanyId(apartment, companyId);
            const canStaffAttach = nextScope === 'apartmentResidents'
                && (0, role_constants_1.isStaffRole)(user.role)
                && Boolean(apartmentCompanyId && this.requireStaffCompanyId(user) === apartmentCompanyId);
            const canMemberAttach = this.isApartmentMember(apartment, user);
            if (!canStaffAttach && !canMemberAttach)
                throw new common_1.ForbiddenException('Access denied for apartment');
            buildingId = this.firstString(apartment.buildingId);
            companyId = apartmentCompanyId;
            apartmentLabel = this.firstString(apartment.number, apartment.apartmentNumber, apartmentId);
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
        const cleanRecord = this.omitUndefined(nextRecord);
        const nextRef = this.documentMetadataRef(cleanRecord);
        if (nextRef.path === ref.path) {
            await ref.set(cleanRecord);
        }
        else {
            const batch = this.firebaseAdminService.firestore.batch();
            batch.set(nextRef, cleanRecord);
            batch.delete(ref);
            await batch.commit();
        }
        return { item: this.serializeDocument(documentId, cleanRecord) };
    }
    async download(user, documentId) {
        this.assertAuthenticated(user);
        const foundDocument = await this.findDocument(documentId);
        if (!foundDocument)
            throw new common_1.NotFoundException('Document not found');
        const data = foundDocument.snap.data();
        if (!(await this.canAccessDocument(user, data))) {
            throw new common_1.ForbiddenException('Access denied for document');
        }
        const storagePath = this.firstString(data.storagePath);
        if (!storagePath)
            throw new common_1.NotFoundException('Document file not found');
        const storageBucket = this.firstString(data.storageBucket);
        const bucket = storageBucket
            ? this.firebaseAdminService.storage.bucket(storageBucket)
            : this.firebaseAdminService.storageBucket;
        const [buffer] = await bucket.file(storagePath).download();
        return {
            buffer,
            fileName: this.sanitizeFileName(data.fileName),
            contentType: this.firstString(data.mimeType, 'application/octet-stream'),
        };
    }
    async remove(user, documentId) {
        this.assertAuthenticated(user);
        const foundDocument = await this.findDocument(documentId);
        if (!foundDocument)
            throw new common_1.NotFoundException('Document not found');
        const { ref, snap } = foundDocument;
        const data = snap.data();
        const scope = this.firstString(data.scope);
        const ownsDocument = this.firstString(data.ownerUserId) === user.uid;
        const canPlatformAdminManage = scope !== 'privateApartment' &&
            scope !== 'apartmentPrivate' &&
            scope !== 'platformPrivate' &&
            (0, role_constants_1.isPlatformAdminRole)(user.role);
        const canManage = scope !== 'privateApartment' &&
            scope !== 'apartmentPrivate' &&
            scope !== 'platformPrivate' &&
            (0, role_constants_1.isStaffRole)(user.role) &&
            this.firstString(data.companyId) === this.requireStaffCompanyId(user);
        if (!ownsDocument && !canPlatformAdminManage && !canManage)
            throw new common_1.ForbiddenException('Access denied for document');
        const storagePath = this.firstString(data.storagePath);
        const storageBucket = this.firstString(data.storageBucket);
        await ref.delete();
        if (storagePath) {
            await (storageBucket
                ? this.firebaseAdminService.storage.bucket(storageBucket)
                : this.firebaseAdminService.storageBucket).file(storagePath).delete({ ignoreNotFound: true }).catch(() => null);
        }
        return { success: true };
    }
};
exports.DocumentsService = DocumentsService;
exports.DocumentsService = DocumentsService = DocumentsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService])
], DocumentsService);
