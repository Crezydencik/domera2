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
var InvoicesService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvoicesService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const role_constants_1 = require("../../common/auth/role.constants");
const firebase_admin_service_1 = require("../../common/infrastructure/firebase/firebase-admin.service");
const rate_limit_service_1 = require("../../common/services/rate-limit.service");
const audit_log_service_1 = require("../../common/services/audit-log.service");
const invitation_token_1 = require("../../common/utils/invitation-token");
const meter_reading_history_1 = require("../../common/utils/meter-reading-history");
const email_service_1 = require("../emails/services/email.service");
const too_many_requests_exception_1 = require("../../common/errors/too-many-requests.exception");
const legacy_scope_1 = require("../../common/utils/legacy-scope");
const apartment_members_1 = require("../../common/utils/apartment-members");
const client_payload_1 = require("../../common/utils/client-payload");
const background_1 = require("../../common/utils/background");
const values_1 = require("../../common/utils/values");
const invoice_types_1 = require("./invoice.types");
const firestore_dates_1 = require("../../common/utils/firestore-dates");
const invoice_pdf_storage_service_1 = require("./services/invoice-pdf-storage.service");
const invoice_upload_history_service_1 = require("./services/invoice-upload-history.service");
const invoice_zip_extractor_1 = require("./services/invoice-zip-extractor");
const INVOICE_UPLOAD_CHUNK_MAX_BYTES = 24 * 1024 * 1024;
const INVOICE_UPLOAD_CHUNK_MAX_COUNT = 25;
const INVOICE_UPLOAD_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{15,127}$/;
let InvoicesService = InvoicesService_1 = class InvoicesService {
    constructor(firebaseAdminService, rateLimitService, auditLogService, emailService, pdfStorage, uploadHistory, zipExtractor) {
        this.firebaseAdminService = firebaseAdminService;
        this.rateLimitService = rateLimitService;
        this.auditLogService = auditLogService;
        this.emailService = emailService;
        this.pdfStorage = pdfStorage;
        this.uploadHistory = uploadHistory;
        this.zipExtractor = zipExtractor;
        this.logger = new common_1.Logger(InvoicesService_1.name);
    }
    assertAuthenticated(user) {
        if (!user?.uid || !user.role)
            throw new common_1.UnauthorizedException('Authentication required');
    }
    isStaff(user) {
        return (0, role_constants_1.isStaffRole)(user.role);
    }
    requireStaffCompanyId(user) {
        const companyId = (0, values_1.firstString)(user.companyId);
        if (!companyId) {
            throw new common_1.ForbiddenException('Company scope is required');
        }
        return companyId;
    }
    normalizeSource(value) {
        const normalized = (0, values_1.firstString)(value).toLowerCase();
        return invoice_types_1.UPLOAD_SOURCES.has(normalized)
            ? normalized
            : 'api';
    }
    normalizeStatus(value) {
        const normalized = (0, values_1.firstString)(value).toLowerCase().replace(/\s+/g, '_');
        return invoice_types_1.INVOICE_STATUSES.has(normalized) ? normalized : 'pending';
    }
    normalizeRecipientType(value) {
        const normalized = (0, values_1.firstString)(value).toLowerCase().replace(/[\s-]+/g, '_');
        return invoice_types_1.INVOICE_RECIPIENT_TYPES.has(normalized)
            ? normalized
            : 'general';
    }
    readChunkNumber(value, name, min, max) {
        const raw = (0, values_1.firstString)(value);
        if (!/^\d+$/.test(raw)) {
            throw new common_1.BadRequestException(`${name} must be an integer`);
        }
        const parsed = Number(raw);
        if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
            throw new common_1.BadRequestException(`${name} is out of range`);
        }
        return parsed;
    }
    invoiceChunkPrefix(companyId, userId, uploadId) {
        const actorHash = (0, node_crypto_1.createHash)('sha256').update(userId).digest('hex').slice(0, 32);
        const safeCompanyId = this.pdfStorage.sanitizePathSegment(companyId);
        return `companies/${safeCompanyId}/invoice_import_chunks/${actorHash}/${uploadId}`;
    }
    async uploadZipChunk(request, user, file, payload) {
        this.assertAuthenticated(user);
        const companyId = this.requireStaffCompanyId(user);
        const uploadId = (0, values_1.firstString)(payload.uploadId);
        if (!INVOICE_UPLOAD_ID_PATTERN.test(uploadId)) {
            throw new common_1.BadRequestException('uploadId must be a 16-128 character opaque identifier');
        }
        const chunkTotal = this.readChunkNumber(payload.chunkTotal, 'chunkTotal', 1, INVOICE_UPLOAD_CHUNK_MAX_COUNT);
        const chunkIndex = this.readChunkNumber(payload.chunkIndex, 'chunkIndex', 0, chunkTotal - 1);
        const chunkSize = file.size ?? file.buffer?.length ?? 0;
        if (!file.buffer || chunkSize <= 0 || chunkSize !== file.buffer.length) {
            throw new common_1.BadRequestException('ZIP chunk is empty or invalid');
        }
        if (chunkSize > INVOICE_UPLOAD_CHUNK_MAX_BYTES) {
            throw new common_1.BadRequestException('Each ZIP chunk must be 24 MiB or smaller');
        }
        if (!this.zipExtractor.isZipFile(file)) {
            throw new common_1.BadRequestException('Chunked upload accepts ZIP files only');
        }
        if (payload.items !== undefined && chunkIndex !== chunkTotal - 1) {
            throw new common_1.BadRequestException('items JSON may only be sent with the final ZIP chunk');
        }
        await this.rateLimitService.enforce(request, 'invoice:upload-chunk', user.uid, 40, 60_000);
        const prefix = this.invoiceChunkPrefix(companyId, user.uid, uploadId);
        const chunkPath = `${prefix}/parts/${String(chunkIndex).padStart(3, '0')}`;
        const chunkFile = this.firebaseAdminService.storageBucket.file(chunkPath);
        const [alreadyExists] = await chunkFile.exists();
        if (alreadyExists) {
            throw new common_1.ConflictException(`ZIP chunk ${chunkIndex} was already uploaded`);
        }
        if (chunkIndex === chunkTotal - 1 && chunkTotal > 1) {
            const earlierParts = Array.from({ length: chunkTotal - 1 }, (_, index) => this.firebaseAdminService.storageBucket.file(`${prefix}/parts/${String(index).padStart(3, '0')}`));
            const missingEarlier = (await Promise.all(earlierParts.map(async (part, index) => {
                const [exists] = await part.exists();
                return exists ? null : index;
            }))).filter((index) => index !== null);
            if (missingEarlier.length > 0) {
                throw new common_1.BadRequestException(`Upload chunks must be sent in order; missing: ${missingEarlier.join(', ')}`);
            }
        }
        await chunkFile.save(file.buffer, {
            resumable: false,
            metadata: {
                contentType: 'application/octet-stream',
                metadata: {
                    uploadId,
                    companyId,
                    actorUidHash: (0, node_crypto_1.createHash)('sha256').update(user.uid).digest('hex').slice(0, 32),
                    chunkIndex: String(chunkIndex),
                    chunkTotal: String(chunkTotal),
                    originalName: this.pdfStorage.sanitizePathSegment((0, values_1.firstString)(file.originalname, 'invoices.zip')),
                },
            },
        });
        if (chunkIndex !== chunkTotal - 1) {
            return {
                success: true,
                upload_id: uploadId,
                received_chunk: chunkIndex,
                remaining_chunks: chunkTotal - chunkIndex - 1,
            };
        }
        const partPaths = Array.from({ length: chunkTotal }, (_, index) => `${prefix}/parts/${String(index).padStart(3, '0')}`);
        const partFiles = partPaths.map((path) => this.firebaseAdminService.storageBucket.file(path));
        const present = await Promise.all(partFiles.map(async (part, index) => {
            const [exists] = await part.exists();
            return exists ? null : index;
        }));
        const missing = present.filter((index) => index !== null);
        if (missing.length > 0) {
            throw new common_1.BadRequestException(`Missing ZIP chunks: ${missing.join(', ')}`);
        }
        const assembledPath = `${prefix}/assembled.zip`;
        const assembledFile = this.firebaseAdminService.storageBucket.file(assembledPath);
        try {
            await this.firebaseAdminService.storageBucket.combine(partFiles, assembledFile);
            const [archive] = await assembledFile.download();
            if (archive.length > 500 * 1024 * 1024) {
                throw new common_1.BadRequestException('ZIP archive is too large');
            }
            return await this.uploadBatch(request, user, [{
                    fieldname: 'files',
                    buffer: archive,
                    originalname: (0, values_1.firstString)(file.originalname, 'invoices.zip'),
                    mimetype: 'application/zip',
                    size: archive.length,
                }], payload);
        }
        finally {
            await Promise.all([...partFiles, assembledFile].map(async (temporaryFile) => {
                try {
                    await temporaryFile.delete({ ignoreNotFound: true });
                }
                catch (error) {
                    this.logger.warn(`invoice.upload_chunk.cleanup_failed path=${temporaryFile.name} reason=${(0, values_1.errorMessage)(error)}`);
                }
            }));
        }
    }
    externalDedupeValue(externalId, recipientType) {
        return recipientType === 'general' ? externalId : `${recipientType}:${externalId}`;
    }
    isActiveTenantRecord(tenant, now = new Date()) {
        if (!tenant || typeof tenant !== 'object')
            return false;
        const record = tenant;
        const status = (0, values_1.firstString)(record.status).toLowerCase();
        if (['removed', 'deleted', 'revoked', 'inactive', 'pending'].includes(status))
            return false;
        const isConfirmed = record.activated === true ||
            Boolean(record.acceptedAt) ||
            Boolean(record.activatedAt) ||
            status === 'active' ||
            status === 'accepted';
        if (!isConfirmed)
            return false;
        const fromDate = this.parseOptionalDate(record.fromDate);
        const until = this.parseOptionalDate(record.until);
        if (fromDate && now < fromDate)
            return false;
        if (until && now > until)
            return false;
        return Boolean((0, values_1.firstString)(record.userId, record.email));
    }
    hasActiveTenant(apartment) {
        const tenants = Array.isArray(apartment.tenants) ? apartment.tenants : [];
        const now = new Date();
        return tenants.some((tenant) => this.isActiveTenantRecord(tenant, now));
    }
    hasActiveOwner(apartment) {
        return apartment.ownerActivated === true && Boolean((0, values_1.firstString)(apartment.ownerId, apartment.ownerEmail));
    }
    resolveEffectiveRecipientType(apartment, requestedRecipientType) {
        void apartment;
        return requestedRecipientType;
    }
    assertRecipientTypeAllowed(apartment, recipientType) {
        void apartment;
        void recipientType;
    }
    parseAmount(value) {
        const raw = typeof value === 'string' ? value.replace(',', '.').trim() : value;
        const amount = Number(raw);
        if (!Number.isFinite(amount) || amount < 0) {
            throw new common_1.BadRequestException('Invalid invoice amount');
        }
        return Math.round(amount * 100) / 100;
    }
    normalizeCurrency(value) {
        const currency = (0, values_1.firstString)(value).toUpperCase();
        if (!/^[A-Z]{3}$/.test(currency)) {
            throw new common_1.BadRequestException('Invalid invoice currency');
        }
        return currency;
    }
    parseDate(value, fieldName) {
        const raw = (0, values_1.firstString)(value);
        if (!raw) {
            throw new common_1.BadRequestException(`${fieldName} is required`);
        }
        const date = new Date(raw);
        if (Number.isNaN(date.getTime())) {
            throw new common_1.BadRequestException(`Invalid ${fieldName}`);
        }
        return date.toISOString().slice(0, 10);
    }
    parseBillingPeriod(payload) {
        const raw = (0, values_1.firstString)(payload.period, payload.billingPeriod, payload.billing_period, payload.accrualPeriod, payload.accrual_period);
        const fromParts = (yearValue, monthValue) => {
            const year = Math.trunc(yearValue);
            const month = Math.trunc(monthValue);
            if (year < 2000 || year > 2100 || month < 1 || month > 12) {
                throw new common_1.BadRequestException('Invalid billing period');
            }
            return {
                year,
                month,
                period: `${year}-${String(month).padStart(2, '0')}`,
            };
        };
        if (raw) {
            const yearMonth = raw.match(/^(\d{4})[-/.](\d{1,2})$/);
            if (yearMonth) {
                return fromParts(Number(yearMonth[1]), Number(yearMonth[2]));
            }
            const monthYear = raw.match(/^(\d{1,2})[-/.](\d{4})$/);
            if (monthYear) {
                return fromParts(Number(monthYear[2]), Number(monthYear[1]));
            }
            throw new common_1.BadRequestException('Invalid billing period');
        }
        return fromParts(Number(payload.year), Number(payload.month));
    }
    validatePdfFile(file) {
        const size = file.size ?? file.buffer?.length ?? 0;
        if (!file.buffer || size <= 0) {
            throw new common_1.BadRequestException('File is required');
        }
        if (size > invoice_types_1.MAX_INVOICE_PDF_BYTES) {
            throw new common_1.BadRequestException('PDF file is too large');
        }
        const extensionLooksValid = file.originalname?.toLowerCase().endsWith('.pdf') ?? false;
        const mimeLooksValid = file.mimetype?.toLowerCase() === 'application/pdf';
        const signatureLooksValid = file.buffer.subarray(0, 5).toString('ascii') === '%PDF-';
        if ((!extensionLooksValid && !mimeLooksValid) || !signatureLooksValid) {
            throw new common_1.BadRequestException('Only valid PDF files are allowed');
        }
    }
    normalizeFileName(value) {
        const name = (0, values_1.firstString)(value) || 'invoice.pdf';
        const normalized = name.replace(/[/\\?%*:|"<>]/g, '_').trim();
        return normalized.toLowerCase().endsWith('.pdf') ? normalized : `${normalized}.pdf`;
    }
    normalizeLookupValue(value) {
        return value.trim().replace(/\s+/g, ' ').toLowerCase();
    }
    buildInvoiceId() {
        return `inv_${(0, node_crypto_1.randomUUID)().replace(/-/g, '').slice(0, 16)}`;
    }
    hashExternalId(companyId, externalId) {
        return (0, node_crypto_1.createHash)('sha256')
            .update(`${companyId}:${externalId.trim().toLowerCase()}`)
            .digest('hex');
    }
    extractCompanyIds(data) {
        const companyIds = new Set();
        const companyId = (0, values_1.firstString)(data.companyId);
        if (companyId)
            companyIds.add(companyId);
        if (Array.isArray(data.companyIds)) {
            for (const value of data.companyIds) {
                const id = (0, values_1.firstString)(value);
                if (id)
                    companyIds.add(id);
            }
        }
        return Array.from(companyIds);
    }
    async getCompanyApartmentContexts(companyId, buildingId) {
        const normalizedCompanyId = (0, values_1.firstString)(companyId);
        if (!normalizedCompanyId)
            return [];
        const db = this.firebaseAdminService.firestore;
        const [arraySnap, directSnap] = await Promise.all([
            db.collection('apartments').where('companyIds', 'array-contains', normalizedCompanyId).get(),
            (0, legacy_scope_1.legacyScopeQuery)(() => db.collection('apartments').where('companyId', '==', normalizedCompanyId).get()),
        ]);
        const requestedBuildingId = (0, values_1.firstString)(buildingId);
        const contexts = new Map();
        for (const doc of [...arraySnap.docs, ...directSnap.docs]) {
            const apartment = doc.data();
            if (!this.apartmentMatchesInvoiceFilters({
                apartment,
                companyId: normalizedCompanyId,
                buildingId: requestedBuildingId,
            })) {
                continue;
            }
            contexts.set(doc.id, { id: doc.id, data: apartment });
        }
        return Array.from(contexts.values());
    }
    getApiKeyBuildingIds(request) {
        const credential = request.apiCredential;
        if (!credential)
            return [];
        const values = Array.isArray(credential.allowedBuildingIds)
            ? credential.allowedBuildingIds
            : credential.buildingId
                ? [credential.buildingId]
                : [];
        return values.filter((value) => typeof value === 'string' && value.trim().length > 0);
    }
    resolveLookupBuildingId(payload, request) {
        return (0, values_1.firstString)(payload.buildingId, payload.building_id, payload.houseId, payload.house_id, this.getApiKeyBuildingIds(request)[0]);
    }
    async findApartmentByField(params) {
        let query = this.firebaseAdminService.firestore.collection('apartments').where(params.field, '==', params.value);
        if (params.buildingId) {
            query = query.where('buildingId', '==', params.buildingId);
        }
        const snap = await query.limit(2).get();
        if (snap.empty)
            return null;
        if (snap.size > 1) {
            throw new common_1.BadRequestException(`Multiple apartments found for ${params.field}`);
        }
        const doc = snap.docs[0];
        return { id: doc.id, data: doc.data() };
    }
    apartmentHasContractNumber(apartment, contractNumber) {
        const normalized = this.normalizeLookupValue(contractNumber);
        const directValues = [
            apartment.contractNumber,
            apartment.ownerContractNumber,
            apartment.tenantContractNumber,
            apartment.agreementNumber,
            apartment.managementAgreementNumber,
        ];
        if (directValues.some((value) => this.normalizeLookupValue((0, values_1.firstString)(value)) === normalized)) {
            return true;
        }
        const nestedLists = [
            apartment.tenants,
            apartment.residents,
            apartment.owners,
            apartment.contracts,
            apartment.agreements,
        ];
        return nestedLists.some((list) => Array.isArray(list) && list.some((entry) => {
            if (!entry || typeof entry !== 'object')
                return false;
            const record = entry;
            return this.normalizeLookupValue((0, values_1.firstString)(record.contractNumber, record.ownerContractNumber, record.tenantContractNumber, record.agreementNumber, record.number)) === normalized;
        }));
    }
    async scanBuildingForContractNumber(buildingId, contractNumber) {
        const snap = await this.firebaseAdminService.firestore
            .collection('apartments')
            .where('buildingId', '==', buildingId)
            .get();
        const matches = snap.docs
            .map((doc) => ({ id: doc.id, data: doc.data() }))
            .filter((apartment) => this.apartmentHasContractNumber(apartment.data, contractNumber));
        if (matches.length > 1) {
            throw new common_1.BadRequestException('Multiple apartments found for contractNumber');
        }
        return matches[0] ?? null;
    }
    async resolveApartment(payload, request) {
        const db = this.firebaseAdminService.firestore;
        const directId = (0, values_1.firstString)(payload.apartmentId, payload.apartment_id);
        const lookupBuildingId = this.resolveLookupBuildingId(payload, request);
        const accountId = (0, values_1.firstString)(payload.accountId, payload.account_id, payload.personalAccountId, payload.personal_account_id, payload.residentAccountId, payload.resident_account_id, payload.billingAccountId, payload.billing_account_id);
        const contractNumber = (0, values_1.firstString)(payload.contractNumber, payload.contract_number, payload.agreementNumber, payload.agreement_number);
        const apartmentNumber = (0, values_1.firstString)(payload.apartmentNumber, payload.apartment_number, payload.flatNumber, payload.flat_number, payload.unitNumber, payload.unit_number, payload.number);
        const lookupValues = [directId, accountId].filter(Boolean);
        if (directId) {
            const snap = await db.collection('apartments').doc(directId).get();
            if (snap.exists) {
                return { id: snap.id, data: snap.data() };
            }
        }
        const accountFields = [
            'accountId',
            'personalAccountId',
            'residentAccountId',
            'billingAccountId',
            'externalAccountId',
            'externalId',
        ];
        for (const value of lookupValues) {
            for (const field of accountFields) {
                const found = await this.findApartmentByField({ field, value, buildingId: lookupBuildingId });
                if (found)
                    return found;
            }
        }
        if (contractNumber) {
            const contractFields = [
                'contractNumber',
                'ownerContractNumber',
                'tenantContractNumber',
                'agreementNumber',
                'managementAgreementNumber',
            ];
            for (const field of contractFields) {
                const found = await this.findApartmentByField({ field, value: contractNumber, buildingId: lookupBuildingId });
                if (found)
                    return found;
            }
            if (lookupBuildingId) {
                const found = await this.scanBuildingForContractNumber(lookupBuildingId, contractNumber);
                if (found)
                    return found;
            }
        }
        if (apartmentNumber) {
            if (!lookupBuildingId) {
                throw new common_1.BadRequestException('buildingId is required when using apartmentNumber');
            }
            const numberFields = ['number', 'apartmentNumber', 'label', 'name'];
            for (const field of numberFields) {
                const found = await this.findApartmentByField({ field, value: apartmentNumber, buildingId: lookupBuildingId });
                if (found)
                    return found;
            }
            const normalizedApartmentNumber = this.normalizeLookupValue(apartmentNumber);
            const snap = await db.collection('apartments').where('buildingId', '==', lookupBuildingId).get();
            const matches = snap.docs
                .map((doc) => ({ id: doc.id, data: doc.data() }))
                .filter((apartment) => this.normalizeLookupValue((0, values_1.firstString)(apartment.data.number, apartment.data.apartmentNumber, apartment.data.label, apartment.data.name)) === normalizedApartmentNumber);
            if (matches.length > 1) {
                throw new common_1.BadRequestException('Multiple apartments found for apartmentNumber');
            }
            if (matches[0])
                return matches[0];
        }
        throw new common_1.NotFoundException('Apartment not found');
    }
    resolveBuildingId(payload, apartment) {
        const payloadBuildingId = (0, values_1.firstString)(payload.buildingId, payload.building_id, payload.houseId, payload.house_id);
        const apartmentBuildingId = (0, values_1.firstString)(apartment.buildingId, apartment.houseId);
        if (payloadBuildingId && apartmentBuildingId && payloadBuildingId !== apartmentBuildingId) {
            throw new common_1.BadRequestException('Apartment does not belong to the selected building');
        }
        const buildingId = payloadBuildingId || apartmentBuildingId;
        if (!buildingId) {
            throw new common_1.BadRequestException('buildingId is required');
        }
        return buildingId;
    }
    assertApiKeyCanAccessBuilding(request, buildingId) {
        const credential = request.apiCredential;
        if (!credential)
            return;
        const allowedBuildingIds = Array.isArray(credential.allowedBuildingIds)
            ? credential.allowedBuildingIds.filter((value) => typeof value === 'string' && value.trim())
            : credential.buildingId
                ? [credential.buildingId]
                : [];
        if (allowedBuildingIds.length === 0) {
            throw new common_1.ForbiddenException('API key is not bound to a building');
        }
        if (!allowedBuildingIds.includes(buildingId)) {
            throw new common_1.ForbiddenException('API key is not allowed for this building');
        }
    }
    async getBuildingCompanyId(buildingId) {
        const snap = await this.firebaseAdminService.firestore.collection('buildings').doc(buildingId).get();
        if (!snap.exists) {
            throw new common_1.NotFoundException('Building not found');
        }
        const data = snap.data();
        return (0, values_1.firstString)(data.companyId, data.managedBy?.companyId);
    }
    async getCompanyBuildingIds(companyId) {
        if (!companyId)
            return [];
        const db = this.firebaseAdminService.firestore;
        const [directSnap, managedSnap] = await Promise.all([
            db.collection('buildings').where('companyId', '==', companyId).get(),
            (0, legacy_scope_1.legacyScopeQuery)(() => db.collection('buildings').where('managedBy.companyId', '==', companyId).get()),
        ]);
        return Array.from(new Set([
            ...directSnap.docs.map((doc) => doc.id),
            ...managedSnap.docs.map((doc) => doc.id),
        ]));
    }
    getApartmentInvoiceCollection(apartmentId) {
        return this.firebaseAdminService.firestore
            .collection('apartments')
            .doc(apartmentId)
            .collection('invoices');
    }
    getApartmentInvoiceExternalIdsCollection(apartmentId) {
        return this.firebaseAdminService.firestore
            .collection('apartments')
            .doc(apartmentId)
            .collection('invoice_external_ids');
    }
    getApartmentPendingInvoiceExternalIdsCollection(apartmentId) {
        return this.firebaseAdminService.firestore
            .collection('apartments')
            .doc(apartmentId)
            .collection('invoice_pending_external_ids');
    }
    getApartmentInvoicePublicLinksCollection(apartmentId) {
        return this.firebaseAdminService.firestore
            .collection('apartments')
            .doc(apartmentId)
            .collection('invoice_public_links');
    }
    async removeLinkedMeterReading(params) {
        const apartmentId = (0, values_1.firstString)(params.apartmentId);
        const readingId = (0, values_1.firstString)(params.readingId);
        if (!apartmentId || !readingId)
            return;
        const db = this.firebaseAdminService.firestore;
        const apartmentRef = db.collection('apartments').doc(apartmentId);
        await db.runTransaction(async (tx) => {
            const apartmentSnap = await tx.get(apartmentRef);
            if (!apartmentSnap.exists)
                return;
            const apartment = apartmentSnap.data();
            const wr = (apartment.waterReadings ?? {});
            let foundKey = null;
            let foundGroup = null;
            for (const key of invoice_types_1.INVOICE_METER_READING_KEYS) {
                const group = wr[key];
                if (!group || !Array.isArray(group.history))
                    continue;
                const hasReading = group.history.some((entry) => (0, values_1.firstString)(entry.id) === readingId);
                if (!hasReading)
                    continue;
                foundKey = key;
                foundGroup = group;
                break;
            }
            if (!foundKey || !foundGroup)
                return;
            const history = foundGroup.history.filter((entry) => (0, values_1.firstString)(entry.id) !== readingId);
            const preserveMultipleElectricityReadings = foundKey === 'electricitymeter'
                && history.some((entry) => (0, values_1.firstString)(entry.source, entry.meterReadingSource) === 'electricity_invoice'
                    || Boolean((0, values_1.firstString)(entry.linkedInvoiceId, entry.linkedInvoiceExternalId)));
            const { history: recalculatedHistory, latestReading } = (0, meter_reading_history_1.buildMeterHistorySnapshot)(history, {
                collapseMonthly: foundKey === 'electricitymeter' ? !preserveMultipleElectricityReadings : true,
            });
            tx.set(apartmentRef, {
                waterReadings: {
                    [foundKey]: {
                        ...foundGroup,
                        history: recalculatedHistory,
                        currentValue: latestReading?.currentValue ?? null,
                        previousValue: latestReading?.previousValue ?? null,
                        submittedAt: latestReading?.submittedAt ?? null,
                    },
                },
            }, { merge: true });
        });
    }
    getBuildingTrashCollection(buildingId) {
        return this.firebaseAdminService.firestore
            .collection('buildings')
            .doc(buildingId)
            .collection('trash');
    }
    resolveInvoiceApartmentId(ref, data, fallbackApartmentId) {
        return (0, values_1.firstString)(data.apartmentId, fallbackApartmentId, ref.parent.parent?.id);
    }
    invoiceApartmentCompanyId(apartment) {
        return apartment ? this.extractCompanyIds(apartment)[0] ?? '' : '';
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
    invoiceDateRange(data) {
        const period = (0, values_1.firstString)(data.period);
        const match = /^(\d{4})-(\d{2})$/.exec(period);
        if (match) {
            const year = Number(match[1]);
            const monthIndex = Number(match[2]) - 1;
            return {
                start: new Date(year, monthIndex, 1, 0, 0, 0),
                end: new Date(year, monthIndex + 1, 0, 23, 59, 59),
            };
        }
        const date = this.parseOptionalDate(data.invoiceDate ?? data.dueDate ?? data.createdAt);
        return date ? { start: date, end: date } : null;
    }
    memberAccessForApartment(user, apartment) {
        const normalizedUserEmail = (0, invitation_token_1.normalizeEmail)(user.email ?? '');
        const ownerEmail = typeof apartment.ownerEmail === 'string' ? (0, invitation_token_1.normalizeEmail)(apartment.ownerEmail) : '';
        const ownerId = typeof apartment.ownerId === 'string' ? apartment.ownerId : '';
        if (apartment.ownerActivated === true &&
            ((ownerId && ownerId === user.uid) || Boolean(normalizedUserEmail && ownerEmail === normalizedUserEmail))) {
            return { type: 'owner' };
        }
        const tenants = Array.isArray(apartment.tenants) ? apartment.tenants : [];
        for (const tenant of tenants) {
            if (!this.isActiveTenantRecord(tenant))
                continue;
            const record = tenant;
            const tenantEmail = typeof record.email === 'string' ? (0, invitation_token_1.normalizeEmail)(record.email) : '';
            const matches = (typeof record.userId === 'string' && record.userId === user.uid) ||
                Boolean(normalizedUserEmail && tenantEmail === normalizedUserEmail);
            if (!matches)
                continue;
            return {
                type: 'tenant',
                fromDate: this.parseOptionalDate(record.fromDate),
                until: this.parseOptionalDate(record.until),
            };
        }
        return null;
    }
    isInvoiceVisibleForPropertyMember(user, apartment, invoice) {
        if (!apartment)
            return false;
        const access = this.memberAccessForApartment(user, apartment);
        if (!access)
            return false;
        const recipientType = this.normalizeRecipientType(invoice.recipientType ?? invoice.recipient_type);
        if (recipientType === 'tenant' && access.type !== 'tenant')
            return false;
        if (recipientType === 'owner' && access.type !== 'owner')
            return false;
        if (access.type !== 'tenant')
            return true;
        const range = this.invoiceDateRange(invoice);
        if (!range)
            return false;
        if (access.fromDate && range.end < access.fromDate)
            return false;
        if (access.until && range.start > access.until)
            return false;
        return true;
    }
    apartmentMatchesInvoiceFilters(params) {
        const companyId = (0, values_1.firstString)(params.companyId);
        const buildingId = (0, values_1.firstString)(params.buildingId);
        const apartmentCompanyIds = this.extractCompanyIds(params.apartment);
        const apartmentBuildingId = (0, values_1.firstString)(params.apartment.buildingId, params.apartment.houseId);
        return (!companyId || apartmentCompanyIds.includes(companyId))
            && (!buildingId || apartmentBuildingId === buildingId);
    }
    invoiceItemFromDoc(doc, fallbackApartmentId, apartmentData) {
        const data = doc.data();
        const safeData = { ...data };
        delete safeData.pdfUrl;
        const apartmentId = this.resolveInvoiceApartmentId(doc.ref, data, fallbackApartmentId);
        const companyId = (0, values_1.firstString)(data.companyId, this.invoiceApartmentCompanyId(apartmentData));
        const buildingId = (0, values_1.firstString)(data.buildingId, apartmentData?.buildingId, apartmentData?.houseId);
        return {
            id: doc.id,
            ...safeData,
            pdfAvailable: Boolean((0, values_1.firstString)(data.storagePath, data.pdfUrl)),
            apartmentId,
            companyId: companyId || undefined,
            buildingId: buildingId || undefined,
            apartmentNumber: (0, values_1.firstString)(data.apartmentNumber, data.number, apartmentData?.number, apartmentData?.apartmentNumber) || undefined,
            invoicePath: (0, values_1.firstString)(data.invoicePath, doc.ref.path),
            recipientType: this.normalizeRecipientType(data.recipientType ?? data.recipient_type),
        };
    }
    async invoiceLocationFromDoc(doc) {
        const fallbackApartmentId = doc.ref.parent.parent?.id;
        const apartmentSnap = fallbackApartmentId
            ? await this.firebaseAdminService.firestore.collection('apartments').doc(fallbackApartmentId).get()
            : null;
        const apartmentData = apartmentSnap?.exists ? apartmentSnap.data() : undefined;
        const data = this.invoiceItemFromDoc(doc, fallbackApartmentId, apartmentData);
        const apartmentId = (0, values_1.firstString)(data.apartmentId, fallbackApartmentId);
        return {
            ref: doc.ref,
            data,
            apartmentId,
        };
    }
    async invoiceLocationFromSnapshot(snap, fallbackApartmentId) {
        const data = snap.data();
        const apartmentId = this.resolveInvoiceApartmentId(snap.ref, data, fallbackApartmentId);
        const apartmentSnap = apartmentId
            ? await this.firebaseAdminService.firestore.collection('apartments').doc(apartmentId).get()
            : null;
        const apartmentData = apartmentSnap?.exists ? apartmentSnap.data() : undefined;
        return {
            ref: snap.ref,
            data: {
                ...this.invoiceItemFromDoc(snap, apartmentId, apartmentData),
                id: (0, values_1.firstString)(data.id, snap.id),
            },
            apartmentId,
        };
    }
    async findInvoiceDocumentInApartments(invoiceId, apartmentIds) {
        if (apartmentIds.length === 0) {
            return null;
        }
        const refs = apartmentIds.map((apartmentId) => this.getApartmentInvoiceCollection(apartmentId).doc(invoiceId));
        const directSnaps = await this.firebaseAdminService.firestore.getAll(...refs);
        const directSnap = directSnaps.find((item) => item.exists);
        if (directSnap) {
            return this.invoiceLocationFromSnapshot(directSnap, directSnap.ref.parent.parent?.id);
        }
        const snapshots = await Promise.all(apartmentIds.map(async (apartmentId) => ({
            apartmentId,
            snapshot: await this.getApartmentInvoiceCollection(apartmentId)
                .where('id', '==', invoiceId)
                .limit(1)
                .get(),
        })));
        const matched = snapshots.find((item) => !item.snapshot.empty);
        const matchedDoc = matched?.snapshot.docs[0];
        if (!matched || !matchedDoc) {
            return null;
        }
        return this.invoiceLocationFromDoc(matchedDoc);
    }
    async activeExternalMarkerId(transaction, marker, target, cleanupStale) {
        if (!marker.exists) {
            return '';
        }
        const data = marker.data();
        const targetId = target === 'invoice'
            ? (0, values_1.firstString)(data.invoiceId)
            : (0, values_1.firstString)(data.approvalId);
        const storedPath = target === 'invoice'
            ? (0, values_1.firstString)(data.invoicePath)
            : (0, values_1.firstString)(data.approvalPath);
        const apartmentId = (0, values_1.firstString)(data.apartmentId);
        const buildingId = (0, values_1.firstString)(data.buildingId);
        const fallbackPath = target === 'invoice' && apartmentId && targetId
            ? `apartments/${apartmentId}/invoices/${targetId}`
            : target === 'approval' && buildingId && targetId
                ? `buildings/${buildingId}/invoice_approvals/${targetId}`
                : '';
        const paths = Array.from(new Set([storedPath, fallbackPath].filter(Boolean)));
        if (paths.length === 0) {
            return targetId || marker.id;
        }
        for (const path of paths) {
            try {
                const snap = await transaction.get(this.firebaseAdminService.firestore.doc(path));
                if (snap.exists) {
                    return targetId || snap.id;
                }
            }
            catch {
            }
        }
        if (cleanupStale) {
            transaction.delete(marker.ref);
        }
        return '';
    }
    shouldQueueInvoiceApproval(request, payload) {
        if (request.apiCredential)
            return true;
        const raw = (0, values_1.firstString)(payload?.queueApproval, payload?.queue_approval, payload?.approvalRequired, payload?.approval_required, payload?.pendingApproval, payload?.pending_approval).toLowerCase();
        return ['1', 'true', 'yes', 'y', 'on'].includes(raw);
    }
    pendingApprovalItemFromDoc(doc, fallbackBuildingId) {
        const data = doc.data();
        const safeData = { ...data };
        delete safeData.pdfUrl;
        const buildingId = (0, values_1.firstString)(data.buildingId, fallbackBuildingId, doc.ref.parent.parent?.id);
        return {
            id: doc.id,
            ...safeData,
            pdfAvailable: Boolean((0, values_1.firstString)(data.storagePath, data.pdfUrl)),
            buildingId: buildingId || undefined,
            createdAt: (0, firestore_dates_1.firestoreDateToIso)(data.createdAt),
            updatedAt: (0, firestore_dates_1.firestoreDateToIso)(data.updatedAt),
        };
    }
    async getPendingApprovalBuildingIds(params) {
        const staffCompanyId = this.requireStaffCompanyId(params.user);
        const requestedCompanyId = (0, values_1.firstString)(params.companyId, staffCompanyId);
        const requestedBuildingId = (0, values_1.firstString)(params.buildingId);
        if (requestedCompanyId !== staffCompanyId) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        if (requestedBuildingId) {
            const buildingCompanyId = await this.getBuildingCompanyId(requestedBuildingId);
            if (buildingCompanyId !== staffCompanyId) {
                throw new common_1.ForbiddenException('Access denied for building');
            }
            if (requestedCompanyId && buildingCompanyId !== requestedCompanyId) {
                throw new common_1.ForbiddenException('Access denied for company');
            }
            return [requestedBuildingId];
        }
        if (!requestedCompanyId) {
            return [];
        }
        return this.getCompanyBuildingIds(requestedCompanyId);
    }
    async findPendingApprovalDocument(user, approvalId) {
        const normalizedApprovalId = (0, values_1.firstString)(approvalId);
        if (!normalizedApprovalId) {
            throw new common_1.BadRequestException('approvalId is required');
        }
        const buildingIds = await this.getPendingApprovalBuildingIds({
            user,
            companyId: user.companyId,
        });
        const refs = buildingIds.map((buildingId) => this.firebaseAdminService.firestore
            .collection('buildings')
            .doc(buildingId)
            .collection('invoice_approvals')
            .doc(normalizedApprovalId));
        const snaps = refs.length ? await this.firebaseAdminService.firestore.getAll(...refs) : [];
        const snap = snaps.find((item) => item.exists);
        if (!snap?.exists) {
            throw new common_1.NotFoundException('Invoice approval not found');
        }
        const buildingId = (0, values_1.firstString)(snap.ref.parent.parent?.id);
        const data = this.pendingApprovalItemFromDoc(snap, buildingId);
        const companyId = (0, values_1.firstString)(data.companyId);
        if (!companyId || companyId !== this.requireStaffCompanyId(user)) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        return {
            ref: snap.ref,
            data,
            buildingId,
        };
    }
    async assertNoPendingApprovalsForApiUpload(buildingId) {
        const pending = await this.firebaseAdminService.firestore
            .collection('buildings')
            .doc(buildingId)
            .collection('invoice_approvals')
            .limit(1)
            .get();
        if (!pending.empty) {
            throw new common_1.ConflictException('API invoice upload is blocked while invoices are waiting for approval. Approve or cancel the current batch first.');
        }
    }
    async getStaffInvoiceApartmentContexts(params) {
        const db = this.firebaseAdminService.firestore;
        const staffCompanyId = this.requireStaffCompanyId(params.user);
        const requestedCompanyId = (0, values_1.firstString)(params.companyId, staffCompanyId);
        const requestedApartmentId = (0, values_1.firstString)(params.apartmentId);
        const requestedBuildingId = (0, values_1.firstString)(params.buildingId);
        if (requestedCompanyId !== staffCompanyId) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        if (requestedApartmentId) {
            const snap = await db.collection('apartments').doc(requestedApartmentId).get();
            if (!snap.exists) {
                throw new common_1.NotFoundException('Apartment not found');
            }
            const apartment = snap.data();
            if (!this.apartmentMatchesInvoiceFilters({ apartment, companyId: staffCompanyId })) {
                throw new common_1.ForbiddenException('Access denied for apartment');
            }
            if (!this.apartmentMatchesInvoiceFilters({
                apartment,
                companyId: requestedCompanyId,
                buildingId: requestedBuildingId,
            })) {
                return [];
            }
            return [{ id: snap.id, data: apartment }];
        }
        const contexts = new Map();
        const addDocs = (docs) => {
            for (const doc of docs) {
                const apartment = doc.data();
                if (!this.apartmentMatchesInvoiceFilters({
                    apartment,
                    companyId: requestedCompanyId,
                    buildingId: requestedBuildingId,
                })) {
                    continue;
                }
                contexts.set(doc.id, { id: doc.id, data: apartment });
            }
        };
        if (requestedBuildingId) {
            const snap = await db.collection('apartments').where('buildingId', '==', requestedBuildingId).get();
            addDocs(snap.docs);
            return Array.from(contexts.values());
        }
        if (!requestedCompanyId) {
            return [];
        }
        const [arraySnap, directSnap] = await Promise.all([
            db.collection('apartments').where('companyIds', 'array-contains', requestedCompanyId).get(),
            (0, legacy_scope_1.legacyScopeQuery)(() => db.collection('apartments').where('companyId', '==', requestedCompanyId).get()),
        ]);
        addDocs(arraySnap.docs);
        addDocs(directSnap.docs);
        return Array.from(contexts.values());
    }
    async findInvoiceDocument(invoiceId, user) {
        const normalizedInvoiceId = (0, values_1.firstString)(invoiceId);
        if (!normalizedInvoiceId) {
            throw new common_1.BadRequestException('invoiceId is required');
        }
        if (user && this.isStaff(user)) {
            const staffCompanyId = (0, values_1.firstString)(user.companyId);
            try {
                const byIdSnapshot = await this.firebaseAdminService.firestore
                    .collectionGroup('invoices')
                    .where('id', '==', normalizedInvoiceId)
                    .limit(5)
                    .get();
                const preferred = byIdSnapshot.docs.find((doc) => doc.data().companyId === staffCompanyId) ?? byIdSnapshot.docs[0];
                if (preferred) {
                    if (byIdSnapshot.size > 1)
                        this.logger.warn(`invoice.lookup.duplicate_id invoiceId=${normalizedInvoiceId}`);
                    return this.invoiceLocationFromDoc(preferred);
                }
            }
            catch (error) {
                this.logger.warn(`invoice.lookup.group_query_failed invoiceId=${normalizedInvoiceId} reason=${(0, values_1.errorMessage)(error)}`);
            }
        }
        const apartmentIds = user
            ? this.isStaff(user)
                ? (await this.getStaffInvoiceApartmentContexts({ user, companyId: user.companyId })).map((item) => item.id)
                : await this.getAccessibleApartmentIds(user)
            : [];
        const scopedInvoice = await this.findInvoiceDocumentInApartments(normalizedInvoiceId, apartmentIds);
        if (scopedInvoice) {
            return scopedInvoice;
        }
        const snapshot = await this.firebaseAdminService.firestore
            .collectionGroup('invoices')
            .where('id', '==', normalizedInvoiceId)
            .limit(2)
            .get();
        if (snapshot.empty) {
            throw new common_1.NotFoundException('Invoice not found');
        }
        if (snapshot.size > 1) {
            this.logger.warn(`invoice.lookup.duplicate_id invoiceId=${normalizedInvoiceId}`);
        }
        const doc = snapshot.docs[0];
        return this.invoiceLocationFromDoc(doc);
    }
    resolveTargetCompanyId(params) {
        const staffCompanyId = this.requireStaffCompanyId(params.user);
        const payloadCompanyId = (0, values_1.firstString)(params.payload.companyId, params.payload.company_id);
        if (payloadCompanyId && payloadCompanyId !== staffCompanyId) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        const apartmentCompanyIds = this.extractCompanyIds(params.apartment);
        const companyId = staffCompanyId;
        if (params.buildingCompanyId && params.buildingCompanyId !== companyId) {
            throw new common_1.ForbiddenException('Access denied for building/company ownership');
        }
        if (apartmentCompanyIds.length > 0 && !apartmentCompanyIds.includes(companyId)) {
            throw new common_1.ForbiddenException('Access denied for apartment/company ownership');
        }
        return companyId;
    }
    resolveResidentContext(apartment) {
        const residentUserIds = new Set();
        const addUserId = (value) => {
            const id = (0, values_1.firstString)(value);
            if (id)
                residentUserIds.add(id);
        };
        addUserId(apartment.residentId);
        addUserId(apartment.ownerId);
        const tenants = Array.isArray(apartment.tenants) ? apartment.tenants : [];
        for (const tenant of tenants) {
            if (!tenant || typeof tenant !== 'object')
                continue;
            addUserId(tenant.userId);
        }
        return {
            residentId: (0, values_1.firstString)(apartment.residentId) || Array.from(residentUserIds)[0] || null,
            residentUserIds: Array.from(residentUserIds),
            residentName: (0, values_1.firstString)(apartment.residentName, [apartment.residentFirstName, apartment.residentLastName]
                .filter((value) => typeof value === 'string' && value.trim())
                .join(' '), apartment.owner, [apartment.ownerFirstName, apartment.ownerLastName]
                .filter((value) => typeof value === 'string' && value.trim())
                .join(' ')) || null,
            residentEmail: (0, values_1.firstString)(apartment.residentEmail, apartment.ownerEmail) || null,
            apartmentNumber: (0, values_1.firstString)(apartment.number, apartment.apartmentNumber, apartment.label),
        };
    }
    resolvePublicAppBaseUrl(request) {
        const configured = (0, values_1.firstString)(process.env.FRONTEND_URL, process.env.PUBLIC_FRONTEND_URL, process.env.APP_PUBLIC_URL, process.env.NEXT_PUBLIC_APP_URL);
        if (configured) {
            return configured.replace(/\/+$/, '');
        }
        const host = request.get('host') || `localhost:${process.env.PORT || '4000'}`;
        const protocol = request.protocol || 'http';
        if (host.startsWith('localhost') || host.startsWith('127.0.0.1')) {
            const hostname = host.split(':')[0] || 'localhost';
            return `${protocol}://${hostname}:3000`;
        }
        return 'https://www.domera.lv';
    }
    authenticatedInvoiceViewLink(invoiceId, request) {
        return `${this.resolvePublicAppBaseUrl(request)}/invoices?openInvoice=${encodeURIComponent(invoiceId)}`;
    }
    resolveInvoiceEmailLanguage(invoice, apartment) {
        const language = (0, values_1.firstString)(invoice.language, invoice.locale, apartment.language, apartment.locale).slice(0, 2).toLowerCase();
        return language === 'en' || language === 'ru' || language === 'lv' ? language : 'lv';
    }
    resolveInvoiceEmailAmount(invoice) {
        const currency = (0, values_1.firstString)(invoice.currency, 'EUR') || 'EUR';
        const amount = invoice.amount;
        if (typeof amount === 'number' && Number.isFinite(amount)) {
            return `${amount.toFixed(2)} ${currency}`;
        }
        return (0, values_1.firstString)(invoice.amount, invoice.totalAmount, invoice.total, `0 ${currency}`);
    }
    resolveInvoiceRecipient(params) {
        const recipientType = this.normalizeRecipientType(params.invoice.recipientType ?? params.invoice.recipient_type);
        const ownerName = (0, values_1.firstString)(params.apartment.ownerName, params.apartment.owner, [params.apartment.ownerFirstName, params.apartment.ownerLastName]
            .filter((value) => typeof value === 'string' && value.trim())
            .join(' '));
        if (recipientType === 'owner') {
            if (!this.hasActiveOwner(params.apartment)) {
                return { email: '', name: '' };
            }
            return {
                email: (0, invitation_token_1.normalizeEmail)((0, values_1.firstString)(params.apartment.ownerEmail, params.invoice.ownerEmail)),
                name: ownerName,
            };
        }
        if (recipientType === 'tenant') {
            const tenants = Array.isArray(params.apartment.tenants) ? params.apartment.tenants : [];
            const activeTenant = tenants.find((tenant) => this.isActiveTenantRecord(tenant));
            if (!activeTenant) {
                return { email: '', name: '' };
            }
            return {
                email: (0, invitation_token_1.normalizeEmail)((0, values_1.firstString)(activeTenant?.email, params.invoice.residentEmail, params.apartment.residentEmail)),
                name: (0, values_1.firstString)(params.invoice.residentName, activeTenant?.name, activeTenant?.fullName, [activeTenant?.firstName, activeTenant?.lastName]
                    .filter((value) => typeof value === 'string' && value.trim())
                    .join(' '), params.apartment.residentName),
            };
        }
        const activeResidentEmail = (0, values_1.firstString)(params.apartment.residentId)
            ? (0, invitation_token_1.normalizeEmail)((0, values_1.firstString)(params.invoice.residentEmail, params.apartment.residentEmail))
            : '';
        const activeOwnerEmail = this.hasActiveOwner(params.apartment)
            ? (0, invitation_token_1.normalizeEmail)((0, values_1.firstString)(params.apartment.ownerEmail, params.invoice.ownerEmail))
            : '';
        return {
            email: (0, values_1.firstString)(activeResidentEmail, activeOwnerEmail),
            name: (0, values_1.firstString)(params.invoice.residentName, params.apartment.residentName, ownerName),
        };
    }
    async sendApprovedInvoiceEmail(params) {
        const recipient = this.resolveInvoiceRecipient({ invoice: params.invoiceData, apartment: params.apartment });
        const recipientEmail = recipient.email;
        if (!recipientEmail) {
            this.logger.warn(`invoice.email.skipped_missing_recipient invoiceId=${params.invoiceId}`);
            return;
        }
        const [pdf, invoiceLink] = await Promise.all([
            this.pdfStorage.resolveInvoicePdfPayload(params.invoiceData, params.invoiceId),
            this.authenticatedInvoiceViewLink(params.invoiceId, params.request),
        ]);
        await this.emailService.sendInvoiceGenerated({
            to: recipientEmail,
            tenantName: recipient.name,
            companyId: (0, values_1.firstString)(params.invoiceData.companyId, params.invoiceData.managementCompanyId, params.apartment.companyId, params.apartment.managementCompanyId),
            brandName: (0, values_1.firstString)(params.invoiceData.companyName, params.apartment.companyName, params.apartment.managementCompanyName),
            apartmentNumber: (0, values_1.firstString)(params.invoiceData.apartmentNumber, params.apartment.number, params.apartment.apartmentNumber),
            buildingName: (0, values_1.firstString)(params.invoiceData.buildingName, params.apartment.buildingName),
            invoiceNumber: (0, values_1.firstString)(params.invoiceData.invoiceNumber, params.invoiceData.externalId, params.invoiceId),
            amount: this.resolveInvoiceEmailAmount(params.invoiceData),
            dueDate: (0, values_1.firstString)(params.invoiceData.dueDate, params.invoiceData.paymentDueDate, params.invoiceData.period, ''),
            invoiceLink,
            language: this.resolveInvoiceEmailLanguage(params.invoiceData, params.apartment),
            attachments: [
                {
                    filename: pdf.fileName,
                    content: pdf.buffer.toString('base64'),
                    contentType: pdf.contentType || 'application/pdf',
                },
            ],
        });
    }
    parseJson(value, message) {
        try {
            return JSON.parse(value);
        }
        catch {
            throw new common_1.BadRequestException(message);
        }
    }
    expandBatchArchives(files, payload) {
        const expandedFiles = [];
        let zippedItems;
        for (const file of files) {
            if (!this.zipExtractor.isZipFile(file)) {
                expandedFiles.push(file);
                continue;
            }
            const extracted = this.zipExtractor.extractZipInvoiceBatch(file);
            expandedFiles.push(...extracted.files);
            if (extracted.itemsJson !== undefined) {
                if (zippedItems !== undefined) {
                    throw new common_1.BadRequestException('Only one ZIP items.json file is supported per request');
                }
                zippedItems = extracted.itemsJson;
            }
        }
        const nextPayload = { ...payload };
        const hasItems = nextPayload.items !== undefined || nextPayload.invoices !== undefined || nextPayload.metadata !== undefined;
        if (!hasItems && zippedItems !== undefined) {
            nextPayload.items = zippedItems;
        }
        return { files: expandedFiles, payload: nextPayload };
    }
    parseBatchItems(payload, fileCount) {
        const rawItems = payload.items ?? payload.invoices ?? payload.metadata;
        let parsed;
        if (typeof rawItems === 'string') {
            parsed = this.parseJson(rawItems, 'items must be a valid JSON array');
        }
        else if (Array.isArray(rawItems)) {
            if (rawItems.length === 1 && typeof rawItems[0] === 'string') {
                parsed = this.parseJson(rawItems[0], 'items must be a valid JSON array');
            }
            else {
                parsed = rawItems.map((item) => typeof item === 'string'
                    ? this.parseJson(item, 'items entries must be valid JSON objects')
                    : item);
            }
        }
        else if (rawItems && typeof rawItems === 'object') {
            parsed = rawItems;
        }
        else if (fileCount === 1) {
            parsed = [payload];
        }
        else {
            throw new common_1.BadRequestException('items JSON array is required');
        }
        if (!Array.isArray(parsed)) {
            throw new common_1.BadRequestException('items must be a JSON array');
        }
        if (parsed.length === 0) {
            throw new common_1.BadRequestException('items must contain at least one invoice');
        }
        if (parsed.length > invoice_types_1.MAX_INVOICE_BATCH_FILES) {
            throw new common_1.BadRequestException(`Batch upload supports up to ${invoice_types_1.MAX_INVOICE_BATCH_FILES} invoices`);
        }
        if (parsed.length !== fileCount) {
            throw new common_1.BadRequestException('items count must match uploaded PDF files count');
        }
        return parsed.map((item, index) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) {
                throw new common_1.BadRequestException(`items[${index}] must be an object`);
            }
            return item;
        });
    }
    parseFileIndex(value, fileCount) {
        if (value === undefined || value === null || value === '')
            return null;
        const index = Number(value);
        if (!Number.isInteger(index) || index < 0 || index >= fileCount) {
            throw new common_1.BadRequestException('Invalid fileIndex in batch item');
        }
        return index;
    }
    resolveBatchFile(params) {
        const { files, item, itemIndex, usedIndexes } = params;
        const fileIndex = this.parseFileIndex(item.fileIndex ?? item.file_index, files.length);
        const fileName = (0, values_1.firstString)(item.fileName, item.file_name, item.originalFileName, item.original_file_name);
        let resolvedIndex = fileIndex;
        if (resolvedIndex === null && fileName) {
            const requestedBaseName = this.zipExtractor.pathBaseName(fileName);
            resolvedIndex = files.findIndex((file, index) => !usedIndexes.has(index)
                && (file.originalname === fileName
                    || this.zipExtractor.pathBaseName(file.originalname ?? '') === requestedBaseName));
            if (resolvedIndex < 0) {
                throw new common_1.BadRequestException(`File not found for batch item: ${fileName}`);
            }
        }
        if (resolvedIndex === null) {
            resolvedIndex = usedIndexes.has(itemIndex)
                ? files.findIndex((_file, index) => !usedIndexes.has(index))
                : itemIndex;
        }
        if (resolvedIndex < 0 || resolvedIndex >= files.length) {
            throw new common_1.BadRequestException(`File is required for batch item ${itemIndex}`);
        }
        if (usedIndexes.has(resolvedIndex)) {
            throw new common_1.BadRequestException(`File is already used by another batch item: ${files[resolvedIndex]?.originalname ?? resolvedIndex}`);
        }
        usedIndexes.add(resolvedIndex);
        const file = files[resolvedIndex];
        if (!file) {
            throw new common_1.BadRequestException(`File is required for batch item ${itemIndex}`);
        }
        return file;
    }
    hasApartmentLookup(item) {
        return Boolean((0, values_1.firstString)(item.apartmentId, item.apartment_id, item.accountId, item.account_id, item.personalAccountId, item.personal_account_id, item.residentAccountId, item.resident_account_id, item.billingAccountId, item.billing_account_id, item.contractNumber, item.contract_number, item.agreementNumber, item.agreement_number, item.apartmentNumber, item.apartment_number, item.flatNumber, item.flat_number, item.unitNumber, item.unit_number, item.number));
    }
    mergeBatchItemPayload(commonPayload, item) {
        if (!this.hasApartmentLookup(item)) {
            return { ...commonPayload, ...item };
        }
        const payload = { ...commonPayload };
        for (const field of [
            'apartmentId', 'apartment_id',
            'accountId', 'account_id',
            'personalAccountId', 'personal_account_id',
            'residentAccountId', 'resident_account_id',
            'billingAccountId', 'billing_account_id',
            'contractNumber', 'contract_number',
            'agreementNumber', 'agreement_number',
            'apartmentNumber', 'apartment_number',
            'flatNumber', 'flat_number',
            'unitNumber', 'unit_number',
            'number',
        ]) {
            delete payload[field];
        }
        return { ...payload, ...item };
    }
    async upload(request, user, file, payload) {
        this.assertAuthenticated(user);
        if (!this.isStaff(user)) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
        const source = this.normalizeSource(payload.source ?? payload.uploadSource);
        const skipUploadHistory = payload.__skipUploadHistory === true;
        const originalFileName = this.normalizeFileName(file.originalname);
        const batchId = (0, values_1.firstString)(payload.batchId, payload.batch_id);
        const uploadHistoryId = (0, values_1.firstString)(payload.uploadHistoryId, payload.upload_history_id, batchId);
        const uploadHistoryBuildingId = (0, values_1.firstString)(payload.uploadHistoryBuildingId, payload.upload_history_building_id);
        const uploadHistoryApartmentId = (0, values_1.firstString)(payload.uploadHistoryApartmentId, payload.upload_history_apartment_id);
        const rawBatchIndex = Number(payload.batchIndex ?? payload.batch_index);
        const batchIndex = Number.isInteger(rawBatchIndex) && rawBatchIndex >= 0 ? rawBatchIndex : null;
        const historyContext = {
            request,
            status: 'error',
            source,
            actorUid: user.uid,
            actorRole: user.role,
            fileName: originalFileName,
            fileSize: file.size ?? file.buffer?.length ?? 0,
            metadata: batchId ? { batchId, batchIndex } : undefined,
        };
        let invoiceRef = null;
        let uniqueRef = null;
        let storagePathForCleanup = null;
        let invoiceReserved = false;
        try {
            this.validatePdfFile(file);
            const rl = await this.rateLimitService.consume(this.rateLimitService.buildKey(request, 'invoice:upload', user.uid), 60, 60_000);
            if (!rl.allowed) {
                throw new too_many_requests_exception_1.TooManyRequestsException(rl.resetAt);
            }
            const externalId = (0, values_1.firstString)(payload.externalId, payload.external_id);
            if (!externalId) {
                throw new common_1.BadRequestException('external_id is required');
            }
            const apartment = await this.resolveApartment(payload, request);
            const buildingId = this.resolveBuildingId(payload, apartment.data);
            this.assertApiKeyCanAccessBuilding(request, buildingId);
            if (this.shouldQueueInvoiceApproval(request, payload) && !batchId) {
                await this.assertNoPendingApprovalsForApiUpload(buildingId);
            }
            const buildingCompanyId = await this.getBuildingCompanyId(buildingId);
            const companyId = this.resolveTargetCompanyId({
                user,
                payload,
                apartment: apartment.data,
                buildingCompanyId,
            });
            const billingPeriod = this.parseBillingPeriod(payload);
            const invoiceDate = this.parseDate(payload.invoiceDate ?? payload.invoice_date ?? payload.date, 'invoiceDate');
            const amount = this.parseAmount(payload.amount);
            const currency = this.normalizeCurrency(payload.currency);
            const status = this.normalizeStatus(payload.status);
            const requestedRecipientType = this.normalizeRecipientType(payload.recipientType ?? payload.recipient_type ?? payload.recepientType ?? payload.recepient_type ?? payload.target);
            const recipientType = this.resolveEffectiveRecipientType(apartment.data, requestedRecipientType);
            this.assertRecipientTypeAllowed(apartment.data, recipientType);
            const comment = (0, values_1.firstString)(payload.comment);
            const meterReadingId = (0, values_1.firstString)(payload.meterReadingId, payload.meter_reading_id);
            const residentContext = this.resolveResidentContext(apartment.data);
            Object.assign(historyContext, {
                companyId,
                buildingId,
                apartmentId: apartment.id,
                externalId,
            });
            const db = this.firebaseAdminService.firestore;
            const externalKey = this.hashExternalId(companyId, this.externalDedupeValue(externalId, recipientType));
            const now = new Date();
            const baseInvoiceData = {
                apartmentId: apartment.id,
                accountId: (0, values_1.firstString)(apartment.data.accountId, apartment.data.personalAccountId, apartment.data.billingAccountId, payload.accountId, payload.account_id) || null,
                buildingId,
                companyId,
                month: billingPeriod.month,
                year: billingPeriod.year,
                period: billingPeriod.period,
                invoiceDate,
                dueDate: invoiceDate,
                amount,
                currency,
                status,
                recipientType,
                comment: comment || null,
                meterReadingId: meterReadingId || null,
                externalId,
                externalIdKey: externalKey,
                source,
                pdfUrl: '',
                storagePath: null,
                storageBucket: null,
                uploadStatus: 'processing',
                residentId: residentContext.residentId,
                residentUserIds: residentContext.residentUserIds,
                residentName: residentContext.residentName,
                residentEmail: residentContext.residentEmail,
                apartmentNumber: residentContext.apartmentNumber || null,
                originalFileName,
                fileSize: file.size ?? file.buffer.length,
                createdAt: now,
                updatedAt: now,
                createdByUid: user.uid,
                uploadedByUid: user.uid,
            };
            if (this.shouldQueueInvoiceApproval(request, payload)) {
                const approvalId = `approval_${(0, node_crypto_1.randomUUID)().replace(/-/g, '').slice(0, 16)}`;
                invoiceRef = db.collection('buildings').doc(buildingId).collection('invoice_approvals').doc(approvalId);
                const approvalPath = invoiceRef.path;
                uniqueRef = this.getApartmentPendingInvoiceExternalIdsCollection(apartment.id).doc(externalKey);
                const invoiceExternalRef = this.getApartmentInvoiceExternalIdsCollection(apartment.id).doc(externalKey);
                storagePathForCleanup = this.pdfStorage.buildPendingApprovalStoragePath({
                    companyId,
                    buildingId,
                    approvalId,
                });
                const approvalData = {
                    id: approvalId,
                    approvalId,
                    approvalPath,
                    uploadHistoryId: uploadHistoryId || null,
                    uploadHistoryBuildingId: uploadHistoryBuildingId || null,
                    uploadHistoryApartmentId: uploadHistoryApartmentId || null,
                    batchId: batchId || null,
                    batchIndex,
                    ...baseInvoiceData,
                    invoiceStatus: status,
                    pdfUrl: '',
                    storagePath: null,
                    storageBucket: null,
                    uploadStatus: 'processing',
                };
                await db.runTransaction(async (transaction) => {
                    const [existingInvoice, duplicatePending] = await Promise.all([
                        transaction.get(invoiceExternalRef),
                        transaction.get(uniqueRef),
                    ]);
                    let staleExistingInvoiceMarker = false;
                    if (existingInvoice.exists) {
                        const duplicateInvoiceId = await this.activeExternalMarkerId(transaction, existingInvoice, 'invoice', false);
                        if (duplicateInvoiceId) {
                            throw new common_1.ConflictException(duplicateInvoiceId
                                ? `Invoice with external_id already exists: ${duplicateInvoiceId}`
                                : 'Invoice with external_id already exists');
                        }
                        staleExistingInvoiceMarker = true;
                    }
                    if (duplicatePending.exists) {
                        const duplicateApprovalId = await this.activeExternalMarkerId(transaction, duplicatePending, 'approval', false);
                        if (duplicateApprovalId) {
                            throw new common_1.ConflictException(duplicateApprovalId
                                ? `Invoice with external_id is waiting for approval: ${duplicateApprovalId}`
                                : 'Invoice with external_id is waiting for approval');
                        }
                    }
                    if (staleExistingInvoiceMarker) {
                        transaction.delete(existingInvoice.ref);
                    }
                    transaction.set(invoiceRef, approvalData);
                    transaction.set(uniqueRef, {
                        companyId,
                        externalId,
                        externalIdKey: externalKey,
                        approvalId,
                        approvalPath,
                        apartmentId: apartment.id,
                        buildingId,
                        source,
                        recipientType,
                        createdAt: now,
                        createdByUid: user.uid,
                    });
                });
                invoiceReserved = true;
                const storedFile = await this.pdfStorage.saveInvoicePdf({
                    file,
                    storagePath: storagePathForCleanup,
                    externalId,
                    invoiceId: approvalId,
                    originalFileName,
                });
                await invoiceRef.set({
                    pdfUrl: storedFile.pdfUrl,
                    storagePath: storedFile.storagePath,
                    storageBucket: storedFile.bucket,
                    uploadStatus: 'success',
                    updatedAt: new Date(),
                }, { merge: true });
                if (!skipUploadHistory) {
                    await this.uploadHistory.writeUploadHistory({
                        ...historyContext,
                        status: 'success',
                        metadata: {
                            approvalId,
                            period: billingPeriod.period,
                            amount,
                            currency,
                            storagePath: storedFile.storagePath,
                            ...(batchId ? { batchId, batchIndex } : {}),
                        },
                    });
                }
                (0, background_1.runInBackground)(this.auditLogService.write({
                    request,
                    action: 'invoice.upload_pending_approval',
                    status: 'success',
                    actorUid: user.uid,
                    actorRole: user.role,
                    companyId,
                    apartmentId: apartment.id,
                    metadata: {
                        approvalId,
                        externalId,
                        recipientType,
                        source,
                        period: billingPeriod.period,
                        fileName: originalFileName,
                        ...(batchId ? { batchId, batchIndex } : {}),
                    },
                }), 'audit');
                return {
                    success: true,
                    approval_id: approvalId,
                    company_id: companyId,
                    building_id: buildingId,
                    apartment_id: apartment.id,
                    message: 'Invoice accepted for approval',
                };
            }
            const invoiceId = this.buildInvoiceId();
            invoiceRef = this.getApartmentInvoiceCollection(apartment.id).doc(invoiceId);
            const invoicePath = invoiceRef.path;
            uniqueRef = this.getApartmentInvoiceExternalIdsCollection(apartment.id).doc(externalKey);
            storagePathForCleanup = this.pdfStorage.buildStoragePath({
                companyId,
                buildingId,
                apartmentId: apartment.id,
                period: billingPeriod.period,
                invoiceId,
            });
            const invoiceData = {
                id: invoiceId,
                ...baseInvoiceData,
            };
            await db.runTransaction(async (transaction) => {
                const duplicate = await transaction.get(uniqueRef);
                if (duplicate.exists) {
                    const duplicateInvoiceId = await this.activeExternalMarkerId(transaction, duplicate, 'invoice', false);
                    if (duplicateInvoiceId) {
                        throw new common_1.ConflictException(duplicateInvoiceId
                            ? `Invoice with external_id already exists: ${duplicateInvoiceId}`
                            : 'Invoice with external_id already exists');
                    }
                }
                transaction.set(invoiceRef, invoiceData);
                transaction.set(uniqueRef, {
                    companyId,
                    externalId,
                    externalIdKey: externalKey,
                    invoiceId,
                    invoicePath,
                    apartmentId: apartment.id,
                    buildingId,
                    source,
                    recipientType,
                    createdAt: now,
                    createdByUid: user.uid,
                });
            });
            invoiceReserved = true;
            const storedFile = await this.pdfStorage.saveInvoicePdf({
                file,
                storagePath: storagePathForCleanup,
                externalId,
                invoiceId,
                originalFileName,
            });
            await invoiceRef.set({
                pdfUrl: storedFile.pdfUrl,
                storagePath: storedFile.storagePath,
                storageBucket: storedFile.bucket,
                uploadStatus: 'success',
                updatedAt: new Date(),
            }, { merge: true });
            if (!skipUploadHistory) {
                await this.uploadHistory.writeUploadHistory({
                    ...historyContext,
                    status: 'success',
                    invoiceId,
                    metadata: {
                        period: billingPeriod.period,
                        amount,
                        currency,
                        storagePath: storedFile.storagePath,
                        ...(batchId ? { batchId, batchIndex } : {}),
                    },
                });
            }
            (0, background_1.runInBackground)(this.auditLogService.write({
                request,
                action: 'invoice.upload',
                status: 'success',
                actorUid: user.uid,
                actorRole: user.role,
                companyId,
                apartmentId: apartment.id,
                metadata: {
                    invoiceId,
                    externalId,
                    recipientType,
                    source,
                    period: billingPeriod.period,
                    fileName: originalFileName,
                    ...(batchId ? { batchId, batchIndex } : {}),
                },
            }), 'audit');
            return {
                success: true,
                invoice_id: invoiceId,
                company_id: companyId,
                building_id: buildingId,
                apartment_id: apartment.id,
                message: 'Invoice uploaded successfully',
            };
        }
        catch (error) {
            const message = (0, values_1.errorMessage)(error);
            const duplicate = error instanceof common_1.ConflictException;
            if (invoiceReserved) {
                await Promise.allSettled([
                    invoiceRef?.delete(),
                    uniqueRef?.delete(),
                    storagePathForCleanup
                        ? this.firebaseAdminService.storageBucket.file(storagePathForCleanup).delete({ ignoreNotFound: true })
                        : Promise.resolve(),
                ]);
            }
            if (!skipUploadHistory) {
                await this.uploadHistory.writeUploadHistory({
                    ...historyContext,
                    status: duplicate ? 'duplicate' : 'error',
                    error: message,
                    metadata: batchId ? { batchId, batchIndex } : undefined,
                });
            }
            (0, background_1.runInBackground)(this.auditLogService.write({
                request,
                action: 'invoice.upload',
                status: duplicate ? 'denied' : 'error',
                reason: message,
                actorUid: user.uid,
                actorRole: user.role,
                companyId: historyContext.companyId,
                apartmentId: historyContext.apartmentId,
                metadata: {
                    externalId: historyContext.externalId,
                    source,
                    fileName: originalFileName,
                    ...(batchId ? { batchId, batchIndex } : {}),
                },
            }), 'audit');
            if (duplicate) {
                this.logger.warn(`invoice.upload.duplicate externalId=${historyContext.externalId ?? 'unknown'} companyId=${historyContext.companyId ?? 'unknown'}`);
            }
            else {
                this.logger.error(`invoice.upload.failed reason=${message}`);
            }
            throw error;
        }
    }
    async listPendingApprovals(user, query) {
        this.assertAuthenticated(user);
        if (!this.isStaff(user)) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
        const buildingIds = await this.getPendingApprovalBuildingIds({
            user,
            companyId: (0, values_1.firstString)(query.companyId),
            buildingId: (0, values_1.firstString)(query.buildingId, query.building_id),
        });
        const limit = Math.min(100, Math.max(1, Number(query.limit ?? 50) || 50));
        const snapshots = await Promise.all(buildingIds.map(async (buildingId) => ({
            buildingId,
            snap: await this.firebaseAdminService.firestore
                .collection('buildings')
                .doc(buildingId)
                .collection('invoice_approvals')
                .get(),
        })));
        const items = snapshots
            .flatMap(({ buildingId, snap }) => snap.docs.map((doc) => this.pendingApprovalItemFromDoc(doc, buildingId)))
            .sort((left, right) => (0, firestore_dates_1.firestoreDateToMillis)(right.createdAt) - (0, firestore_dates_1.firestoreDateToMillis)(left.createdAt))
            .slice(0, limit);
        return { items };
    }
    async pendingApprovalPdf(user, approvalId) {
        this.assertAuthenticated(user);
        if (!this.isStaff(user)) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
        const approval = await this.findPendingApprovalDocument(user, approvalId);
        const storagePath = (0, values_1.firstString)(approval.data.storagePath);
        if (!storagePath) {
            throw new common_1.NotFoundException('Invoice PDF not found');
        }
        const storageBucket = (0, values_1.firstString)(approval.data.storageBucket);
        const bucket = storageBucket
            ? this.firebaseAdminService.storage.bucket(storageBucket)
            : this.firebaseAdminService.storageBucket;
        const file = bucket.file(storagePath);
        const [metadata] = await file.getMetadata();
        const size = Number(metadata.size ?? 0);
        if (Number.isFinite(size) && size > invoice_types_1.MAX_INVOICE_PDF_BYTES) {
            throw new common_1.BadRequestException('Invoice PDF is too large');
        }
        const [buffer] = await file.download();
        return this.pdfStorage.asPdfPayload(buffer, this.pdfStorage.resolveInvoicePdfFileName(approval.data, approvalId));
    }
    async approvePendingApproval(request, user, approvalId, options = {}) {
        this.assertAuthenticated(user);
        if (!this.isStaff(user)) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
        const approval = await this.findPendingApprovalDocument(user, approvalId);
        const data = approval.data;
        const apartmentId = (0, values_1.firstString)(data.apartmentId);
        if (!apartmentId) {
            throw new common_1.BadRequestException('Approval is missing apartmentId');
        }
        const apartmentSnap = await this.firebaseAdminService.firestore.collection('apartments').doc(apartmentId).get();
        if (!apartmentSnap.exists) {
            throw new common_1.NotFoundException('Apartment not found');
        }
        const apartment = apartmentSnap.data();
        const companyId = (0, values_1.firstString)(data.companyId);
        const buildingId = (0, values_1.firstString)(data.buildingId, approval.buildingId);
        if (!companyId || companyId !== this.requireStaffCompanyId(user)) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        if (!this.apartmentMatchesInvoiceFilters({ apartment, companyId, buildingId })) {
            throw new common_1.ForbiddenException('Approval apartment no longer matches building/company');
        }
        const externalId = (0, values_1.firstString)(data.externalId);
        if (!externalId) {
            throw new common_1.BadRequestException('Approval is missing externalId');
        }
        const db = this.firebaseAdminService.firestore;
        const invoiceId = this.buildInvoiceId();
        const recipientType = this.normalizeRecipientType(data.recipientType ?? data.recipient_type);
        const externalKey = (0, values_1.firstString)(data.externalIdKey)
            || this.hashExternalId(companyId, this.externalDedupeValue(externalId, recipientType));
        const invoiceRef = this.getApartmentInvoiceCollection(apartmentId).doc(invoiceId);
        const invoicePath = invoiceRef.path;
        const invoiceExternalRef = this.getApartmentInvoiceExternalIdsCollection(apartmentId).doc(externalKey);
        const pendingExternalRef = this.getApartmentPendingInvoiceExternalIdsCollection(apartmentId).doc(externalKey);
        const now = new Date();
        const invoiceData = {
            id: invoiceId,
            apartmentId,
            accountId: data.accountId ?? null,
            buildingId,
            companyId,
            month: data.month ?? null,
            year: data.year ?? null,
            period: (0, values_1.firstString)(data.period) || null,
            invoiceDate: data.invoiceDate ?? null,
            dueDate: data.dueDate ?? data.invoiceDate ?? null,
            amount: data.amount ?? null,
            currency: (0, values_1.firstString)(data.currency, 'EUR'),
            status: this.normalizeStatus(data.invoiceStatus ?? data.status),
            recipientType,
            comment: data.comment ?? null,
            meterReadingId: data.meterReadingId ?? null,
            externalId,
            externalIdKey: externalKey,
            source: (0, values_1.firstString)(data.source, 'api'),
            batchId: (0, values_1.firstString)(data.batchId) || null,
            batchIndex: typeof data.batchIndex === 'number' ? data.batchIndex : null,
            pdfUrl: (0, values_1.firstString)(data.pdfUrl),
            storagePath: (0, values_1.firstString)(data.storagePath) || null,
            storageBucket: (0, values_1.firstString)(data.storageBucket) || null,
            residentId: data.residentId ?? null,
            residentUserIds: Array.isArray(data.residentUserIds) ? data.residentUserIds : [],
            residentName: data.residentName ?? null,
            residentEmail: data.residentEmail ?? null,
            apartmentNumber: data.apartmentNumber ?? null,
            originalFileName: data.originalFileName ?? null,
            fileSize: data.fileSize ?? null,
            createdAt: data.createdAt ?? now,
            createdByUid: data.createdByUid ?? user.uid,
            uploadedByUid: data.uploadedByUid ?? data.createdByUid ?? user.uid,
            invoicePath,
            approvedFromApprovalId: approvalId,
            uploadStatus: 'success',
            updatedAt: now,
            approvedAt: now,
            approvedByUid: user.uid,
        };
        await db.runTransaction(async (transaction) => {
            const [approvalSnap, duplicate] = await Promise.all([
                transaction.get(approval.ref),
                transaction.get(invoiceExternalRef),
            ]);
            if (!approvalSnap.exists) {
                throw new common_1.NotFoundException('Invoice approval not found');
            }
            if (duplicate.exists) {
                const duplicateInvoiceId = await this.activeExternalMarkerId(transaction, duplicate, 'invoice', false);
                if (duplicateInvoiceId) {
                    throw new common_1.ConflictException(duplicateInvoiceId
                        ? `Invoice with external_id already exists: ${duplicateInvoiceId}`
                        : 'Invoice with external_id already exists');
                }
            }
            transaction.set(invoiceRef, invoiceData);
            transaction.set(invoiceExternalRef, {
                companyId,
                externalId,
                externalIdKey: externalKey,
                invoiceId,
                invoicePath,
                apartmentId,
                buildingId,
                source: (0, values_1.firstString)(data.source, 'api'),
                approvalId,
                recipientType,
                createdAt: now,
                createdByUid: user.uid,
            });
            transaction.delete(approval.ref);
            transaction.delete(pendingExternalRef);
        });
        (0, background_1.runInBackground)(this.auditLogService.write({
            request,
            action: 'invoice.approve_api_upload',
            status: 'success',
            actorUid: user.uid,
            actorRole: user.role,
            companyId,
            apartmentId,
            metadata: {
                approvalId,
                invoiceId,
                externalId,
            },
        }), 'audit');
        await this.uploadHistory.updateUploadHistoryForApproval({
            approvalId,
            buildingId,
            apartmentId,
            companyId,
            historyId: (0, values_1.firstString)(data.uploadHistoryId, data.batchId),
            historyBuildingId: (0, values_1.firstString)(data.uploadHistoryBuildingId, buildingId),
            historyApartmentId: (0, values_1.firstString)(data.uploadHistoryApartmentId, apartmentId),
            invoiceId,
            status: 'approved',
        });
        const requestedNotificationIds = Array.isArray(options.notifyApprovalIds)
            ? options.notifyApprovalIds.map((value) => (0, values_1.firstString)(value)).filter(Boolean)
            : [];
        const notifyRecipients = options.notifyRecipients !== false
            && options.notifyRecipients !== 'false'
            && (requestedNotificationIds.length === 0 || requestedNotificationIds.includes(approvalId));
        if (notifyRecipients) {
            (0, background_1.runInBackground)(this.sendApprovedInvoiceEmail({
                request,
                invoiceId,
                invoiceData,
                apartment,
            }).catch((error) => {
                this.logger.warn(`invoice.email.send_failed invoiceId=${invoiceId} reason=${(0, values_1.errorMessage)(error)}`);
            }), 'invoice_email');
        }
        return {
            success: true,
            invoice_id: invoiceId,
            message: 'Invoice approved',
        };
    }
    async cancelPendingApproval(request, user, approvalId) {
        this.assertAuthenticated(user);
        if (!this.isStaff(user)) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
        const approval = await this.findPendingApprovalDocument(user, approvalId);
        const data = approval.data;
        const companyId = (0, values_1.firstString)(data.companyId);
        const buildingId = (0, values_1.firstString)(data.buildingId, approval.buildingId);
        const apartmentId = (0, values_1.firstString)(data.apartmentId);
        const meterReadingId = (0, values_1.firstString)(data.meterReadingId, data.meter_reading_id);
        const externalId = (0, values_1.firstString)(data.externalId);
        const externalKey = (0, values_1.firstString)(data.externalIdKey)
            || (companyId && externalId ? this.hashExternalId(companyId, externalId) : '');
        const pendingExternalRef = externalKey && apartmentId
            ? this.getApartmentPendingInvoiceExternalIdsCollection(apartmentId).doc(externalKey)
            : null;
        const storagePath = (0, values_1.firstString)(data.storagePath);
        const storageBucket = (0, values_1.firstString)(data.storageBucket);
        await this.firebaseAdminService.firestore.runTransaction(async (transaction) => {
            const approvalSnap = await transaction.get(approval.ref);
            if (!approvalSnap.exists) {
                throw new common_1.NotFoundException('Invoice approval not found');
            }
            transaction.delete(approval.ref);
            if (pendingExternalRef)
                transaction.delete(pendingExternalRef);
        });
        if (storagePath) {
            await (storageBucket
                ? this.firebaseAdminService.storage.bucket(storageBucket)
                : this.firebaseAdminService.storageBucket).file(storagePath).delete({ ignoreNotFound: true }).catch(() => null);
        }
        if (meterReadingId && apartmentId) {
            await this.removeLinkedMeterReading({ apartmentId, readingId: meterReadingId }).catch((error) => {
                this.logger.warn(`invoice.approval.linked_reading_delete_failed approvalId=${approvalId} reason=${(0, values_1.errorMessage)(error)}`);
            });
        }
        (0, background_1.runInBackground)(this.auditLogService.write({
            request,
            action: 'invoice.cancel_api_upload',
            status: 'success',
            actorUid: user.uid,
            actorRole: user.role,
            companyId,
            apartmentId,
            metadata: {
                approvalId,
                externalId,
                buildingId,
            },
        }), 'audit');
        await this.uploadHistory.updateUploadHistoryForApproval({
            approvalId,
            buildingId,
            apartmentId,
            companyId,
            historyId: (0, values_1.firstString)(data.uploadHistoryId, data.batchId),
            historyBuildingId: (0, values_1.firstString)(data.uploadHistoryBuildingId, buildingId),
            historyApartmentId: (0, values_1.firstString)(data.uploadHistoryApartmentId, apartmentId),
            status: 'cancelled',
            error: 'Cancelled',
        });
        return {
            success: true,
            message: 'Invoice approval cancelled',
        };
    }
    normalizeApprovalIds(payload) {
        const raw = payload.approvalIds ?? payload.approval_ids ?? payload.ids;
        if (!Array.isArray(raw)) {
            return [];
        }
        return Array.from(new Set(raw.map((value) => (0, values_1.firstString)(value)).filter(Boolean)));
    }
    async processApprovalIds(approvalIds, worker) {
        const results = [];
        let nextIndex = 0;
        const runWorker = async () => {
            while (nextIndex < approvalIds.length) {
                const index = nextIndex;
                nextIndex += 1;
                const approvalId = approvalIds[index];
                if (!approvalId)
                    continue;
                results[index] = await worker(approvalId);
            }
        };
        await runWorker();
        return results;
    }
    async approvePendingApprovals(request, user, payload) {
        const approvalIds = this.normalizeApprovalIds(payload);
        if (approvalIds.length === 0) {
            throw new common_1.BadRequestException('approvalIds are required');
        }
        const results = await this.processApprovalIds(approvalIds, async (approvalId) => {
            try {
                const result = await this.approvePendingApproval(request, user, approvalId, payload);
                return {
                    approval_id: approvalId,
                    success: true,
                    invoice_id: (0, values_1.firstString)(result.invoice_id) || undefined,
                };
            }
            catch (error) {
                return {
                    approval_id: approvalId,
                    success: false,
                    error: (0, values_1.errorMessage)(error),
                };
            }
        });
        const processed = results.filter((item) => item.success).length;
        return {
            success: processed === results.length,
            total: results.length,
            processed,
            failed: results.length - processed,
            results,
        };
    }
    async cancelPendingApprovals(request, user, payload) {
        const approvalIds = this.normalizeApprovalIds(payload);
        if (approvalIds.length === 0) {
            throw new common_1.BadRequestException('approvalIds are required');
        }
        const results = await this.processApprovalIds(approvalIds, async (approvalId) => {
            try {
                await this.cancelPendingApproval(request, user, approvalId);
                return {
                    approval_id: approvalId,
                    success: true,
                };
            }
            catch (error) {
                return {
                    approval_id: approvalId,
                    success: false,
                    error: (0, values_1.errorMessage)(error),
                };
            }
        });
        const processed = results.filter((item) => item.success).length;
        return {
            success: processed === results.length,
            total: results.length,
            processed,
            failed: results.length - processed,
            results,
        };
    }
    async uploadBatch(request, user, files, payload) {
        this.assertAuthenticated(user);
        if (!this.isStaff(user)) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
        if (!Array.isArray(files) || files.length === 0) {
            throw new common_1.BadRequestException('At least one PDF file is required');
        }
        if (files.length > invoice_types_1.MAX_INVOICE_BATCH_FILES) {
            throw new common_1.BadRequestException(`Batch upload supports up to ${invoice_types_1.MAX_INVOICE_BATCH_FILES} invoices`);
        }
        const rl = await this.rateLimitService.consume(this.rateLimitService.buildKey(request, 'invoice:upload-batch', user.uid), 10, 60_000);
        if (!rl.allowed) {
            throw new too_many_requests_exception_1.TooManyRequestsException(rl.resetAt);
        }
        const requestFileName = files.length === 1
            ? (0, values_1.firstString)(files[0]?.originalname, 'upload')
            : `${files.length} files`;
        const expandedBatch = this.expandBatchArchives(files, payload);
        const batchFiles = expandedBatch.files;
        const batchPayload = expandedBatch.payload;
        if (batchFiles.length === 0) {
            throw new common_1.BadRequestException('At least one PDF file is required');
        }
        if (batchFiles.length > invoice_types_1.MAX_INVOICE_BATCH_FILES) {
            throw new common_1.BadRequestException(`Batch upload supports up to ${invoice_types_1.MAX_INVOICE_BATCH_FILES} invoices`);
        }
        const items = this.parseBatchItems(batchPayload, batchFiles.length);
        const batchId = `batch_${(0, node_crypto_1.randomUUID)().replace(/-/g, '').slice(0, 16)}`;
        const usedIndexes = new Set();
        const commonPayload = { ...batchPayload };
        delete commonPayload.items;
        delete commonPayload.invoices;
        delete commonPayload.metadata;
        const source = this.normalizeSource(commonPayload.source ?? commonPayload.uploadSource);
        const apiBuildingIds = this.getApiKeyBuildingIds(request);
        if (this.shouldQueueInvoiceApproval(request, commonPayload)) {
            const buildingIds = new Set();
            for (const item of items) {
                const itemPayload = this.mergeBatchItemPayload(commonPayload, item);
                const apartment = await this.resolveApartment(itemPayload, request);
                const buildingId = this.resolveBuildingId(itemPayload, apartment.data);
                this.assertApiKeyCanAccessBuilding(request, buildingId);
                buildingIds.add(buildingId);
            }
            await Promise.all(Array.from(buildingIds, (buildingId) => this.assertNoPendingApprovalsForApiUpload(buildingId)));
        }
        let historyCompanyId = (0, values_1.firstString)(commonPayload.companyId, commonPayload.company_id, user.companyId);
        let historyBuildingId = (0, values_1.firstString)(commonPayload.buildingId, commonPayload.building_id, apiBuildingIds[0]);
        let historyApartmentId = (0, values_1.firstString)(commonPayload.apartmentId, commonPayload.apartment_id);
        if (!historyApartmentId || !historyBuildingId || !historyCompanyId) {
            try {
                const scopePayload = this.mergeBatchItemPayload(commonPayload, items[0] ?? {});
                const apartment = await this.resolveApartment(scopePayload, request);
                const buildingId = this.resolveBuildingId(scopePayload, apartment.data);
                this.assertApiKeyCanAccessBuilding(request, buildingId);
                const buildingCompanyId = await this.getBuildingCompanyId(buildingId);
                historyApartmentId = (0, values_1.firstString)(historyApartmentId, apartment.id);
                historyBuildingId = (0, values_1.firstString)(historyBuildingId, buildingId);
                historyCompanyId = (0, values_1.firstString)(historyCompanyId, buildingCompanyId, this.extractCompanyIds(apartment.data)[0]);
            }
            catch (error) {
                this.logger.warn(`invoice.upload_batch.history_scope_unresolved reason=${(0, values_1.errorMessage)(error)}`);
            }
        }
        if (!historyBuildingId && historyCompanyId) {
            const companyBuildingIds = await this.getCompanyBuildingIds(historyCompanyId).catch(() => []);
            if (companyBuildingIds.length === 1) {
                historyBuildingId = companyBuildingIds[0];
            }
        }
        const initialHistoryBuildingId = historyBuildingId;
        const initialHistoryApartmentId = historyApartmentId;
        await this.uploadHistory.writeUploadHistory({
            historyId: batchId,
            request,
            status: 'pending',
            source,
            actorUid: user.uid,
            actorRole: user.role,
            companyId: historyCompanyId,
            buildingId: historyBuildingId,
            apartmentId: historyApartmentId,
            fileName: requestFileName,
            error: undefined,
            metadata: {
                batchId,
                companyId: historyCompanyId || undefined,
                buildingId: historyBuildingId || undefined,
                apartmentId: historyApartmentId || undefined,
                requestFileName,
                total: batchFiles.length,
                processed: 0,
                failed: 0,
                waiting: batchFiles.length,
                files: batchFiles.map((file) => (0, values_1.firstString)(file.originalname)).filter(Boolean),
                results: [],
            },
        });
        const results = [];
        const uploadJobs = [];
        const commonExternalId = (0, values_1.firstString)(commonPayload.externalId, commonPayload.external_id);
        const externalIdCounts = new Map();
        for (const item of items) {
            const externalId = (0, values_1.firstString)(item.externalId, item.external_id, commonExternalId);
            if (!externalId)
                continue;
            const key = externalId.trim().toLowerCase();
            externalIdCounts.set(key, (externalIdCounts.get(key) ?? 0) + 1);
        }
        const externalIdSeen = new Map();
        for (const [index, item] of items.entries()) {
            let fileName = this.normalizeFileName((0, values_1.firstString)(item.fileName, item.file_name, batchFiles[index]?.originalname) || `invoice-${index + 1}.pdf`);
            try {
                const file = this.resolveBatchFile({
                    files: batchFiles,
                    item,
                    itemIndex: index,
                    usedIndexes,
                });
                fileName = this.normalizeFileName(file.originalname ?? fileName);
                const itemExternalId = (0, values_1.firstString)(item.externalId, item.external_id);
                const baseExternalId = (0, values_1.firstString)(itemExternalId, commonExternalId);
                const duplicateExternalIdInBatch = baseExternalId && (externalIdCounts.get(baseExternalId.trim().toLowerCase()) ?? 0) > 1;
                const batchItemExternalId = baseExternalId;
                const itemRecipientType = (0, values_1.firstString)(item.recipientType, item.recipient_type, item.recepientType, item.recepient_type, item.target);
                let duplicateExternalIdOccurrence = 0;
                if (duplicateExternalIdInBatch && baseExternalId) {
                    const key = baseExternalId.trim().toLowerCase();
                    duplicateExternalIdOccurrence = (externalIdSeen.get(key) ?? 0) + 1;
                    externalIdSeen.set(key, duplicateExternalIdOccurrence);
                }
                let batchItemRecipientType = itemRecipientType;
                if (duplicateExternalIdOccurrence > 0) {
                    const normalizedItemRecipientType = this.normalizeRecipientType(itemRecipientType);
                    const automaticRecipientType = duplicateExternalIdOccurrence === 1 ? 'owner' : 'tenant';
                    batchItemRecipientType =
                        itemRecipientType && normalizedItemRecipientType !== 'owner'
                            ? normalizedItemRecipientType
                            : automaticRecipientType;
                }
                uploadJobs.push({
                    index,
                    item,
                    file,
                    fileName,
                    payload: {
                        ...this.mergeBatchItemPayload(commonPayload, item),
                        ...(batchItemExternalId ? { externalId: batchItemExternalId, external_id: batchItemExternalId } : {}),
                        ...(batchItemRecipientType ? { recipientType: batchItemRecipientType, recipient_type: batchItemRecipientType } : {}),
                        source: item.source ?? item.uploadSource ?? commonPayload.source ?? commonPayload.uploadSource ?? 'api',
                        batchId,
                        batchIndex: index,
                        uploadHistoryId: batchId,
                        uploadHistoryBuildingId: initialHistoryBuildingId,
                        uploadHistoryApartmentId: initialHistoryApartmentId,
                        __skipUploadHistory: true,
                    },
                });
            }
            catch (error) {
                results.push({
                    index,
                    fileName,
                    success: false,
                    error: (0, values_1.errorMessage)(error),
                });
            }
        }
        let nextJobIndex = 0;
        const runUploadJob = async () => {
            while (nextJobIndex < uploadJobs.length) {
                const job = uploadJobs[nextJobIndex];
                nextJobIndex += 1;
                if (!job)
                    continue;
                try {
                    const result = await this.upload(request, user, job.file, {
                        ...job.payload,
                    });
                    const uploadResult = result;
                    results.push({
                        index: job.index,
                        fileName: job.fileName,
                        success: true,
                        invoice_id: uploadResult.invoice_id,
                        approval_id: uploadResult.approval_id,
                        company_id: uploadResult.company_id,
                        building_id: uploadResult.building_id,
                        apartment_id: uploadResult.apartment_id,
                        message: uploadResult.message,
                    });
                }
                catch (error) {
                    const message = (0, values_1.errorMessage)(error);
                    const waitingApprovalId = message.match(/waiting for approval:\s*([A-Za-z0-9_-]+)/)?.[1];
                    if (waitingApprovalId) {
                        results.push({
                            index: job.index,
                            fileName: job.fileName,
                            success: false,
                            approval_id: waitingApprovalId,
                            error: `Invoice is already waiting for approval: ${waitingApprovalId}`,
                        });
                        continue;
                    }
                    results.push({
                        index: job.index,
                        fileName: job.fileName,
                        success: false,
                        error: message,
                    });
                }
            }
        };
        await Promise.all(Array.from({ length: Math.min(invoice_types_1.INVOICE_BATCH_UPLOAD_CONCURRENCY, uploadJobs.length) }, () => runUploadJob()));
        results.sort((left, right) => left.index - right.index);
        for (const result of results) {
            historyCompanyId = (0, values_1.firstString)(historyCompanyId, result.company_id);
            historyBuildingId = (0, values_1.firstString)(historyBuildingId, result.building_id);
            historyApartmentId = (0, values_1.firstString)(historyApartmentId, result.apartment_id);
        }
        const processed = results.filter((item) => item.success).length;
        const failed = results.length - processed;
        const waiting = results.filter((item) => item.success && item.approval_id).length;
        const historyStatus = failed > 0
            ? 'error'
            : waiting > 0
                ? 'pending'
                : 'success';
        const finalHistoryInput = {
            historyId: batchId,
            request,
            status: historyStatus,
            source,
            actorUid: user.uid,
            actorRole: user.role,
            companyId: historyCompanyId,
            buildingId: historyBuildingId,
            apartmentId: historyApartmentId,
            fileName: requestFileName,
            error: failed > 0 ? `${failed} invoice(s) failed` : undefined,
            metadata: {
                batchId,
                companyId: historyCompanyId || undefined,
                buildingId: historyBuildingId || undefined,
                apartmentId: historyApartmentId || undefined,
                requestFileName,
                total: results.length,
                processed,
                failed,
                waiting,
                files: batchFiles.map((file) => (0, values_1.firstString)(file.originalname)).filter(Boolean),
                results,
            },
        };
        await this.uploadHistory.writeUploadHistory(finalHistoryInput);
        if (initialHistoryApartmentId && initialHistoryApartmentId !== historyApartmentId) {
            await this.uploadHistory.writeUploadHistory({
                ...finalHistoryInput,
                apartmentId: initialHistoryApartmentId,
                metadata: {
                    ...(finalHistoryInput.metadata ?? {}),
                    apartmentId: initialHistoryApartmentId,
                    resolvedApartmentId: historyApartmentId || undefined,
                },
            });
        }
        if (initialHistoryBuildingId && initialHistoryBuildingId !== historyBuildingId) {
            await this.uploadHistory.writeUploadHistory({
                ...finalHistoryInput,
                buildingId: initialHistoryBuildingId,
                apartmentId: initialHistoryApartmentId,
                metadata: {
                    ...(finalHistoryInput.metadata ?? {}),
                    buildingId: initialHistoryBuildingId,
                    apartmentId: initialHistoryApartmentId || undefined,
                    resolvedBuildingId: historyBuildingId || undefined,
                },
            });
        }
        (0, background_1.runInBackground)(this.auditLogService.write({
            request,
            action: 'invoice.upload_batch',
            status: processed > 0 ? 'success' : 'error',
            reason: failed > 0 ? `${failed} invoice(s) failed` : undefined,
            actorUid: user.uid,
            actorRole: user.role,
            companyId: user.companyId,
            metadata: {
                batchId,
                total: results.length,
                processed,
                failed,
            },
        }), 'audit');
        return {
            success: failed === 0,
            batch_id: batchId,
            total: results.length,
            processed,
            failed,
            message: failed === 0
                ? 'Invoice batch uploaded successfully'
                : processed > 0
                    ? 'Invoice batch processed with errors'
                    : 'Invoice batch failed',
            results,
        };
    }
    async listUploadHistory(user, query) {
        this.assertAuthenticated(user);
        if (!this.isStaff(user)) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
        const staffCompanyId = this.requireStaffCompanyId(user);
        const requestedCompanyId = (0, values_1.firstString)(query.companyId);
        if (requestedCompanyId && requestedCompanyId !== staffCompanyId) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        const companyId = requestedCompanyId || staffCompanyId;
        const requestedBuildingId = (0, values_1.firstString)(query.buildingId, query.building_id);
        const requestedApartmentId = (0, values_1.firstString)(query.apartmentId, query.apartment_id);
        const limit = Math.min(100, Math.max(1, Number(query.limit ?? 50) || 50));
        let legacyBuildingIds = [];
        if (requestedBuildingId) {
            const buildingCompanyId = await this.getBuildingCompanyId(requestedBuildingId);
            if (buildingCompanyId !== staffCompanyId) {
                throw new common_1.ForbiddenException('Access denied for building');
            }
            if (companyId && buildingCompanyId !== companyId) {
                throw new common_1.ForbiddenException('Access denied for company');
            }
            legacyBuildingIds = [requestedBuildingId];
        }
        else if (companyId) {
            legacyBuildingIds = await this.getCompanyBuildingIds(companyId);
        }
        else {
            return { items: [] };
        }
        const apartmentContexts = await this.getStaffInvoiceApartmentContexts({
            user,
            companyId,
            apartmentId: requestedApartmentId,
            buildingId: requestedBuildingId,
        });
        if (requestedApartmentId) {
            legacyBuildingIds = Array.from(new Set(apartmentContexts
                .map((apartment) => (0, values_1.firstString)(apartment.data.buildingId, apartment.data.houseId))
                .filter(Boolean)));
        }
        const historyReadTasks = [
            ...apartmentContexts.map(async (apartment) => ({
                apartmentId: apartment.id,
                buildingId: (0, values_1.firstString)(apartment.data.buildingId, apartment.data.houseId) || undefined,
                snap: await this.uploadHistory.getApartmentInvoiceUploadHistoryCollection(apartment.id).get(),
            })),
            ...legacyBuildingIds.map(async (buildingId) => ({
                buildingId,
                snap: await this.uploadHistory.getLegacyBuildingInvoiceUploadHistoryCollection(buildingId).get(),
            })),
        ];
        const snapshotResults = await Promise.allSettled(historyReadTasks);
        const snapshots = snapshotResults.flatMap((result, index) => {
            if (result.status === 'fulfilled')
                return [result.value];
            this.logger.warn(`invoice.upload.history.read.failed index=${index} reason=${(0, values_1.errorMessage)(result.reason)}`);
            return [];
        });
        const entries = snapshots.flatMap(({ apartmentId, buildingId, snap }) => snap.docs.map((historyDoc) => ({ apartmentId, buildingId, historyDoc })));
        const entryKey = (entry) => `${(0, values_1.firstString)(entry.apartmentId, entry.buildingId)}:${entry.historyDoc.id}`;
        const baseItemsByPath = new Map();
        for (const entry of entries) {
            baseItemsByPath.set(entryKey(entry), this.uploadHistory.toUploadHistoryBaseItem(entry, entry.historyDoc));
        }
        const pageKeys = new Set(this.uploadHistory.groupUploadHistoryItems(baseItemsByPath, limit).flatMap((item) => item.__sourceKeys));
        const reconcileResults = await Promise.allSettled(entries
            .filter((entry) => pageKeys.has(entryKey(entry)))
            .map(async (entry) => ({
            key: entryKey(entry),
            item: await this.uploadHistory.reconcileUploadHistoryDoc({ buildingId: entry.buildingId, apartmentId: entry.apartmentId }, entry.historyDoc),
        })));
        const rawItemsByPath = new Map();
        for (const result of reconcileResults) {
            if (result.status === 'fulfilled') {
                rawItemsByPath.set(result.value.key, result.value.item);
                continue;
            }
            this.logger.warn(`invoice.upload.history.reconcile.failed reason=${(0, values_1.errorMessage)(result.reason)}`);
        }
        const items = this.uploadHistory.groupUploadHistoryItems(rawItemsByPath, limit).map((item) => {
            const rest = { ...item };
            delete rest.__sourceKeys;
            return rest;
        });
        return { items };
    }
    async getAccessibleApartmentIds(user) {
        const candidates = await (0, apartment_members_1.findCandidateApartments)(this.firebaseAdminService.firestore, user);
        const normalizedUserEmail = (0, invitation_token_1.normalizeEmail)(user.email ?? '');
        return Array.from(candidates.entries())
            .filter(([, apartment]) => {
            const ownerId = typeof apartment.ownerId === 'string' ? apartment.ownerId : '';
            const ownerEmail = typeof apartment.ownerEmail === 'string' ? (0, invitation_token_1.normalizeEmail)(apartment.ownerEmail) : '';
            const isResident = false;
            const isOwner = apartment.ownerActivated === true &&
                ((ownerId && ownerId === user.uid) || Boolean(normalizedUserEmail && ownerEmail === normalizedUserEmail));
            const tenants = Array.isArray(apartment.tenants) ? apartment.tenants : [];
            const isTenant = tenants.some((tenant) => {
                if (!this.isActiveTenantRecord(tenant))
                    return false;
                const t = tenant;
                const tenantEmail = typeof t.email === 'string' ? (0, invitation_token_1.normalizeEmail)(t.email) : '';
                return ((typeof t.userId === 'string' && t.userId === user.uid) ||
                    Boolean(normalizedUserEmail && tenantEmail === normalizedUserEmail));
            });
            return isResident || isOwner || isTenant;
        })
            .map(([apartmentId]) => apartmentId);
    }
    async create(request, user, payload) {
        this.assertAuthenticated(user);
        if (!this.isStaff(user)) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
        const apartmentId = typeof payload.apartmentId === 'string' ? payload.apartmentId.trim() : '';
        const amount = Number(payload.amount);
        if (!apartmentId || !Number.isFinite(amount)) {
            throw new common_1.BadRequestException('Invalid invoice payload');
        }
        const rl = await this.rateLimitService.consume(this.rateLimitService.buildKey(request, 'invoice:create', user.uid), 20, 60_000);
        if (!rl.allowed)
            throw new too_many_requests_exception_1.TooManyRequestsException(rl.resetAt);
        const db = this.firebaseAdminService.firestore;
        const apartmentSnap = await db.collection('apartments').doc(apartmentId).get();
        if (!apartmentSnap.exists)
            throw new common_1.NotFoundException('Apartment not found');
        const apartmentData = apartmentSnap.data();
        const apartmentCompanyIds = this.extractCompanyIds(apartmentData);
        const payloadCompanyId = typeof payload.companyId === 'string' ? payload.companyId : undefined;
        const staffCompanyId = this.requireStaffCompanyId(user);
        if (payloadCompanyId && payloadCompanyId !== staffCompanyId) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        const targetCompanyId = staffCompanyId;
        if (!targetCompanyId || !apartmentCompanyIds.includes(targetCompanyId)) {
            throw new common_1.ForbiddenException('Access denied for apartment/company ownership');
        }
        const ref = this.getApartmentInvoiceCollection(apartmentId).doc();
        const invoiceId = ref.id;
        const requestedRecipientType = this.normalizeRecipientType(payload.recipientType ?? payload.recipient_type ?? payload.target);
        const recipientType = this.resolveEffectiveRecipientType(apartmentData, requestedRecipientType);
        this.assertRecipientTypeAllowed(apartmentData, recipientType);
        const data = {
            id: invoiceId,
            apartmentId,
            month: Number(payload.month),
            year: Number(payload.year),
            amount,
            currency: (0, values_1.firstString)(payload.currency, 'EUR'),
            externalId: (0, values_1.firstString)(payload.externalId) || null,
            meterReadingId: (0, values_1.firstString)(payload.meterReadingId, payload.meter_reading_id) || null,
            period: (0, values_1.firstString)(payload.period) || null,
            invoiceDate: this.parseOptionalDate(payload.invoiceDate) ?? new Date(),
            dueDate: this.parseOptionalDate(payload.dueDate) ?? this.parseOptionalDate(payload.invoiceDate) ?? new Date(),
            comment: (0, values_1.firstString)(payload.comment) || '',
            status: payload.status === 'pending' || payload.status === 'paid' || payload.status === 'overdue'
                ? payload.status
                : 'pending',
            pdfUrl: typeof payload.pdfUrl === 'string' ? payload.pdfUrl : '',
            companyId: targetCompanyId,
            buildingId: (0, values_1.firstString)(payload.buildingId, apartmentData.buildingId, apartmentData.houseId) || null,
            recipientType,
            createdAt: new Date(),
            createdByUid: user.uid,
        };
        await ref.set(data);
        (0, background_1.runInBackground)(this.auditLogService.write({
            request,
            action: 'invoice.create',
            status: 'success',
            actorUid: user.uid,
            actorRole: user.role,
            companyId: targetCompanyId,
            apartmentId,
            metadata: { invoiceId },
        }), 'audit');
        return { success: true, invoice: data };
    }
    async list(user, query) {
        this.assertAuthenticated(user);
        if (this.isStaff(user)) {
            const companyId = query.companyId ?? user.companyId;
            const requestedApartmentId = typeof query.apartmentId === 'string' ? query.apartmentId.trim() : '';
            const requestedBuildingId = typeof query.buildingId === 'string' ? query.buildingId.trim() : '';
            if (!requestedApartmentId) {
                const staffCompanyId = this.requireStaffCompanyId(user);
                if ((0, values_1.firstString)(companyId, staffCompanyId) !== staffCompanyId) {
                    throw new common_1.ForbiddenException('Access denied for company');
                }
                const page = await this.listStaffInvoicesViaCollectionGroup({
                    companyId: staffCompanyId,
                    buildingId: requestedBuildingId || undefined,
                    recipientType: query.recipientType ? this.normalizeRecipientType(query.recipientType) : null,
                    limit: query.limit ? Math.min(200, Math.max(1, Number(query.limit) || 50)) : undefined,
                    cursor: (0, values_1.firstString)(query.cursor) || undefined,
                });
                if (page)
                    return { ...page, query };
            }
            const apartmentContexts = await this.getStaffInvoiceApartmentContexts({
                user,
                companyId,
                apartmentId: requestedApartmentId,
                buildingId: requestedBuildingId,
            });
            const snapshots = await Promise.all(apartmentContexts.map(async (apartment) => ({
                apartment,
                snapshot: await this.getApartmentInvoiceCollection(apartment.id).get(),
            })));
            const recipientType = query.recipientType ? this.normalizeRecipientType(query.recipientType) : null;
            const items = snapshots.flatMap(({ apartment, snapshot }) => snapshot.docs
                .map((doc) => this.invoiceItemFromDoc(doc, apartment.id, apartment.data))
                .filter((item) => !recipientType || item.recipientType === recipientType));
            return { items, query };
        }
        if (!(0, role_constants_1.isPropertyMemberRole)(user.role)) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
        const accessibleApartmentIds = await this.getAccessibleApartmentIds(user);
        if (!accessibleApartmentIds.length) {
            return { items: [], query };
        }
        const requestedApartmentId = typeof query.apartmentId === 'string' ? query.apartmentId.trim() : '';
        if (requestedApartmentId && !accessibleApartmentIds.includes(requestedApartmentId)) {
            throw new common_1.ForbiddenException('Access denied for apartment');
        }
        const apartmentIdsToLoad = requestedApartmentId ? [requestedApartmentId] : accessibleApartmentIds;
        const recipientType = query.recipientType ? this.normalizeRecipientType(query.recipientType) : null;
        const snapshots = await Promise.all(apartmentIdsToLoad.map(async (apartmentId) => {
            const [apartmentSnap, snapshot] = await Promise.all([
                this.firebaseAdminService.firestore.collection('apartments').doc(apartmentId).get(),
                this.getApartmentInvoiceCollection(apartmentId).get(),
            ]);
            return {
                apartmentId,
                apartment: apartmentSnap.exists ? apartmentSnap.data() : undefined,
                snapshot,
            };
        }));
        const items = snapshots.flatMap(({ apartmentId, apartment, snapshot }) => snapshot.docs
            .map((doc) => this.invoiceItemFromDoc(doc, apartmentId, apartment))
            .filter((item) => !recipientType || item.recipientType === recipientType)
            .filter((item) => this.isInvoiceVisibleForPropertyMember(user, apartment, item)));
        return { items, query };
    }
    async listStaffInvoicesViaCollectionGroup(params) {
        const db = this.firebaseAdminService.firestore;
        let ref = db.collectionGroup('invoices').where('companyId', '==', params.companyId);
        if (params.buildingId)
            ref = ref.where('buildingId', '==', params.buildingId);
        if (params.limit) {
            ref = ref.orderBy('createdAt', 'desc');
            if (params.cursor) {
                const cursorPath = this.decodeInvoiceCursor(params.cursor);
                const cursorSnap = cursorPath ? await db.doc(cursorPath).get() : null;
                if (!cursorSnap?.exists)
                    throw new common_1.BadRequestException('Invalid cursor');
                const cursorData = cursorSnap.data();
                if (cursorData.companyId !== params.companyId)
                    throw new common_1.BadRequestException('Invalid cursor');
                ref = ref.startAfter(cursorSnap);
            }
            ref = ref.limit(params.limit + 1);
        }
        let snapshot;
        try {
            snapshot = await ref.get();
        }
        catch (error) {
            if (this.isMissingIndexError(error)) {
                this.logger.warn(`invoice.list.collection_group_index_missing fallback=per_apartment reason=${(0, values_1.errorMessage)(error)}`);
                return null;
            }
            throw error;
        }
        const hasMore = Boolean(params.limit && snapshot.docs.length > params.limit);
        const docs = hasMore ? snapshot.docs.slice(0, params.limit) : snapshot.docs;
        const apartmentIdsToLoad = Array.from(new Set(docs
            .filter((doc) => {
            const data = doc.data();
            return !(0, values_1.firstString)(data.buildingId) || !(0, values_1.firstString)(data.apartmentNumber, data.number);
        })
            .map((doc) => doc.ref.parent.parent?.id)
            .filter((id) => Boolean(id))));
        const apartmentsById = new Map();
        for (let index = 0; index < apartmentIdsToLoad.length; index += 300) {
            const refs = apartmentIdsToLoad.slice(index, index + 300).map((id) => db.collection('apartments').doc(id));
            for (const snap of await db.getAll(...refs)) {
                if (snap.exists)
                    apartmentsById.set(snap.id, snap.data());
            }
        }
        const items = docs
            .map((doc) => {
            const apartmentId = doc.ref.parent.parent?.id;
            return this.invoiceItemFromDoc(doc, apartmentId, apartmentId ? apartmentsById.get(apartmentId) : undefined);
        })
            .filter((item) => !params.recipientType || item.recipientType === params.recipientType);
        const lastDoc = docs[docs.length - 1];
        return {
            items,
            nextCursor: hasMore && lastDoc ? this.encodeInvoiceCursor(lastDoc.ref.path) : null,
        };
    }
    encodeInvoiceCursor(path) {
        return Buffer.from(path, 'utf8').toString('base64url');
    }
    decodeInvoiceCursor(cursor) {
        try {
            const path = Buffer.from(cursor, 'base64url').toString('utf8');
            return /^apartments\/[^/]+\/invoices\/[^/]+$/.test(path) ? path : null;
        }
        catch {
            return null;
        }
    }
    isMissingIndexError(error) {
        const code = error?.code;
        return code === 9 || code === 'failed-precondition' || /requires an index|FAILED_PRECONDITION/i.test((0, values_1.errorMessage)(error));
    }
    async byId(user, invoiceId, includePdfUrl = false) {
        this.assertAuthenticated(user);
        const invoice = await this.findInvoiceDocument(invoiceId, user);
        const data = invoice.data;
        const targetCompanyId = typeof data.companyId === 'string' ? data.companyId : undefined;
        const apartmentId = typeof data.apartmentId === 'string' ? data.apartmentId : undefined;
        if (this.isStaff(user)) {
            if (!targetCompanyId || this.requireStaffCompanyId(user) !== targetCompanyId) {
                throw new common_1.ForbiddenException('Access denied for company');
            }
        }
        else {
            if (!(0, role_constants_1.isPropertyMemberRole)(user.role)) {
                throw new common_1.ForbiddenException('Insufficient permissions');
            }
            const accessibleApartmentIds = await this.getAccessibleApartmentIds(user);
            if (!apartmentId || !accessibleApartmentIds.includes(apartmentId)) {
                throw new common_1.ForbiddenException('Access denied for apartment');
            }
            const apartmentSnap = await this.firebaseAdminService.firestore.collection('apartments').doc(apartmentId).get();
            const apartment = apartmentSnap.exists ? apartmentSnap.data() : undefined;
            if (!this.isInvoiceVisibleForPropertyMember(user, apartment, data)) {
                throw new common_1.ForbiddenException('Access denied for invoice');
            }
        }
        const response = { id: invoice.ref.id, ...data, apartmentId };
        if (!includePdfUrl)
            delete response.pdfUrl;
        return response;
    }
    async pdf(user, invoiceId) {
        const invoice = await this.byId(user, invoiceId, true);
        return this.pdfStorage.resolveInvoicePdfPayload(invoice, invoiceId);
    }
    async resendEmail(request, user, invoiceId) {
        this.assertAuthenticated(user);
        if (!this.isStaff(user)) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
        const rl = await this.rateLimitService.consume(this.rateLimitService.buildKey(request, 'invoice:resend-email', `${user.uid}:${invoiceId}`), 20, 60_000);
        if (!rl.allowed)
            throw new too_many_requests_exception_1.TooManyRequestsException(rl.resetAt);
        const invoice = await this.findInvoiceDocument(invoiceId, user);
        const invoiceData = invoice.data;
        const targetCompanyId = typeof invoiceData.companyId === 'string' ? invoiceData.companyId : undefined;
        if (!targetCompanyId || this.requireStaffCompanyId(user) !== targetCompanyId) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        const apartmentId = (0, values_1.firstString)(invoice.apartmentId, invoiceData.apartmentId);
        if (!apartmentId) {
            throw new common_1.NotFoundException('Apartment not found');
        }
        const apartmentSnap = await this.firebaseAdminService.firestore.collection('apartments').doc(apartmentId).get();
        if (!apartmentSnap.exists) {
            throw new common_1.NotFoundException('Apartment not found');
        }
        const apartment = apartmentSnap.data();
        const companyId = (0, values_1.firstString)(invoiceData.companyId, this.invoiceApartmentCompanyId(apartment));
        await this.sendApprovedInvoiceEmail({
            request,
            invoiceId,
            invoiceData,
            apartment,
        });
        (0, background_1.runInBackground)(this.auditLogService.write({
            request,
            action: 'invoice.email_resend',
            status: 'success',
            actorUid: user.uid,
            actorRole: user.role,
            companyId,
            apartmentId,
            metadata: { invoiceId },
        }), 'audit');
        return { success: true };
    }
    async update(request, user, invoiceId, payload) {
        this.assertAuthenticated(user);
        if (!this.isStaff(user)) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
        const rl = await this.rateLimitService.consume(this.rateLimitService.buildKey(request, 'invoice:update', `${user.uid}:${invoiceId}`), 30, 60_000);
        if (!rl.allowed)
            throw new too_many_requests_exception_1.TooManyRequestsException(rl.resetAt);
        const invoice = await this.findInvoiceDocument(invoiceId, user);
        const ref = invoice.ref;
        const current = invoice.data;
        const targetCompanyId = typeof current.companyId === 'string' ? current.companyId : undefined;
        if (!targetCompanyId || this.requireStaffCompanyId(user) !== targetCompanyId) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        const nextPayload = {
            ...(0, client_payload_1.sanitizeClientPayload)(payload, { protectedKeys: invoice_types_1.INVOICE_PROTECTED_FIELDS }),
            updatedAt: new Date(),
        };
        await ref.set(nextPayload, { merge: true });
        (0, background_1.runInBackground)(this.auditLogService.write({
            request,
            action: typeof payload.pdfUrl === 'string' && payload.pdfUrl !== current.pdfUrl
                ? 'invoice.file_attach'
                : 'invoice.update',
            status: 'success',
            actorUid: user.uid,
            actorRole: user.role,
            companyId: targetCompanyId,
            apartmentId: typeof current.apartmentId === 'string' ? current.apartmentId : undefined,
            metadata: { invoiceId },
        }), 'audit');
        return { success: true };
    }
    async findInvoiceTrashDocument(trashId, user) {
        const normalizedTrashId = (0, values_1.firstString)(trashId);
        if (!normalizedTrashId) {
            throw new common_1.BadRequestException('trashId is required');
        }
        const snapshot = await this.firebaseAdminService.firestore
            .collectionGroup('trash')
            .where('id', '==', normalizedTrashId)
            .where('type', '==', 'invoice')
            .limit(1)
            .get();
        const doc = snapshot.docs[0];
        if (!doc) {
            throw new common_1.NotFoundException('Trash item not found');
        }
        const data = doc.data();
        const companyId = (0, values_1.firstString)(data.companyId);
        if (!companyId || companyId !== this.requireStaffCompanyId(user)) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        return { ref: doc.ref, data };
    }
    async listTrash(user, query) {
        this.assertAuthenticated(user);
        if (!this.isStaff(user)) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
        const companyId = this.requireStaffCompanyId(user);
        const requestedBuildingId = (0, values_1.firstString)(query.buildingId);
        const limitValue = Number(query.limit ?? 100);
        const limit = Number.isFinite(limitValue) && limitValue > 0 ? Math.min(Math.floor(limitValue), 200) : 100;
        let trashQuery = this.firebaseAdminService.firestore
            .collectionGroup('trash')
            .where('type', '==', 'invoice')
            .where('companyId', '==', companyId);
        if (requestedBuildingId) {
            trashQuery = trashQuery.where('buildingId', '==', requestedBuildingId);
        }
        const snapshot = await trashQuery
            .orderBy('deletedAt', 'desc')
            .limit(limit)
            .get();
        return {
            items: snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            })),
            query,
        };
    }
    async restoreTrash(request, user, trashId) {
        this.assertAuthenticated(user);
        if (!this.isStaff(user)) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
        const trash = await this.findInvoiceTrashDocument(trashId, user);
        const data = trash.data;
        const invoiceData = data.invoiceData && typeof data.invoiceData === 'object'
            ? data.invoiceData
            : null;
        if (!invoiceData) {
            throw new common_1.BadRequestException('Trash item is missing invoice data');
        }
        const apartmentId = (0, values_1.firstString)(data.apartmentId, invoiceData.apartmentId);
        const invoiceId = (0, values_1.firstString)(data.originalInvoiceId, invoiceData.id);
        const buildingId = (0, values_1.firstString)(data.buildingId, invoiceData.buildingId);
        const companyId = (0, values_1.firstString)(data.companyId, invoiceData.companyId);
        const externalId = (0, values_1.firstString)(invoiceData.externalId);
        const recipientType = this.normalizeRecipientType(invoiceData.recipientType ?? invoiceData.recipient_type);
        const externalIdKey = (0, values_1.firstString)(invoiceData.externalIdKey)
            || (companyId && externalId ? this.hashExternalId(companyId, this.externalDedupeValue(externalId, recipientType)) : '');
        if (!apartmentId || !invoiceId || !companyId || companyId !== this.requireStaffCompanyId(user)) {
            throw new common_1.BadRequestException('Trash item cannot be restored');
        }
        const invoiceRef = this.getApartmentInvoiceCollection(apartmentId).doc(invoiceId);
        const externalRef = externalIdKey ? this.getApartmentInvoiceExternalIdsCollection(apartmentId).doc(externalIdKey) : null;
        const invoicePath = invoiceRef.path;
        const now = new Date();
        await this.firebaseAdminService.firestore.runTransaction(async (transaction) => {
            const [invoiceSnap, externalSnap] = await Promise.all([
                transaction.get(invoiceRef),
                externalRef ? transaction.get(externalRef) : Promise.resolve(null),
            ]);
            if (invoiceSnap.exists) {
                throw new common_1.ConflictException('Invoice already exists');
            }
            if (externalSnap?.exists) {
                const duplicateInvoiceId = await this.activeExternalMarkerId(transaction, externalSnap, 'invoice', false);
                if (duplicateInvoiceId) {
                    throw new common_1.ConflictException(`Invoice with external_id already exists: ${duplicateInvoiceId}`);
                }
            }
            transaction.set(invoiceRef, {
                ...invoiceData,
                id: invoiceId,
                apartmentId,
                buildingId: buildingId || invoiceData.buildingId || null,
                companyId,
                invoicePath,
                restoredAt: now,
                restoredByUid: user.uid,
                updatedAt: now,
            });
            if (externalRef && externalIdKey) {
                transaction.set(externalRef, {
                    companyId,
                    externalId,
                    externalIdKey,
                    invoiceId,
                    invoicePath,
                    apartmentId,
                    buildingId: buildingId || invoiceData.buildingId || null,
                    source: (0, values_1.firstString)(invoiceData.source, 'api'),
                    recipientType,
                    restoredAt: now,
                    restoredByUid: user.uid,
                });
            }
            transaction.delete(trash.ref);
        });
        (0, background_1.runInBackground)(this.auditLogService.write({
            request,
            action: 'invoice.restore',
            status: 'success',
            actorUid: user.uid,
            actorRole: user.role,
            companyId,
            apartmentId,
            metadata: { invoiceId, trashId },
        }), 'audit');
        return { success: true, invoice_id: invoiceId };
    }
    async purgeTrash(request, user, trashId) {
        this.assertAuthenticated(user);
        if (!this.isStaff(user)) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
        const trash = await this.findInvoiceTrashDocument(trashId, user);
        const data = trash.data;
        const expiresAt = this.parseOptionalDate(data.expiresAt);
        if (!expiresAt || expiresAt.getTime() > Date.now()) {
            throw new common_1.BadRequestException('Trash item can be purged after retention expires');
        }
        const invoiceData = data.invoiceData && typeof data.invoiceData === 'object'
            ? data.invoiceData
            : {};
        const storagePath = (0, values_1.firstString)(data.storagePath, invoiceData.storagePath);
        const storageBucket = (0, values_1.firstString)(data.storageBucket, invoiceData.storageBucket);
        const companyId = (0, values_1.firstString)(data.companyId, invoiceData.companyId);
        const apartmentId = (0, values_1.firstString)(data.apartmentId, invoiceData.apartmentId);
        await trash.ref.delete();
        if (storagePath) {
            await (storageBucket
                ? this.firebaseAdminService.storage.bucket(storageBucket)
                : this.firebaseAdminService.storageBucket).file(storagePath).delete({ ignoreNotFound: true }).catch(() => null);
        }
        (0, background_1.runInBackground)(this.auditLogService.write({
            request,
            action: 'invoice.trash_purge',
            status: 'success',
            actorUid: user.uid,
            actorRole: user.role,
            companyId,
            apartmentId,
            metadata: { trashId, storagePath },
        }), 'audit');
        return { success: true };
    }
    async remove(request, user, invoiceId) {
        this.assertAuthenticated(user);
        if (!this.isStaff(user)) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
        const [rl, invoice] = await Promise.all([
            this.rateLimitService.consume(this.rateLimitService.buildKey(request, 'invoice:delete', `${user.uid}:${invoiceId}`), 20, 60_000),
            this.findInvoiceDocument(invoiceId, user),
        ]);
        if (!rl.allowed)
            throw new too_many_requests_exception_1.TooManyRequestsException(rl.resetAt);
        const ref = invoice.ref;
        const current = invoice.data;
        const targetCompanyId = typeof current.companyId === 'string' ? current.companyId : undefined;
        if (!targetCompanyId || this.requireStaffCompanyId(user) !== targetCompanyId) {
            throw new common_1.ForbiddenException('Access denied for company');
        }
        const storagePath = typeof current.storagePath === 'string' ? current.storagePath : '';
        const storageBucket = typeof current.storageBucket === 'string' ? current.storageBucket : '';
        const apartmentId = (0, values_1.firstString)(current.apartmentId, ref.parent.parent?.id);
        let buildingId = (0, values_1.firstString)(current.buildingId);
        if (!buildingId && apartmentId) {
            const apartmentSnap = await this.firebaseAdminService.firestore.collection('apartments').doc(apartmentId).get();
            const apartment = apartmentSnap.exists ? apartmentSnap.data() : {};
            buildingId = (0, values_1.firstString)(apartment.buildingId, apartment.houseId);
        }
        if (!buildingId) {
            throw new common_1.BadRequestException('Invoice is missing buildingId for trash retention');
        }
        const externalId = (0, values_1.firstString)(current.externalId);
        const companyId = (0, values_1.firstString)(targetCompanyId, user.companyId);
        const recipientType = this.normalizeRecipientType(current.recipientType ?? current.recipient_type);
        const externalIdKey = (0, values_1.firstString)(current.externalIdKey)
            || (companyId && externalId ? this.hashExternalId(companyId, this.externalDedupeValue(externalId, recipientType)) : '');
        const deleteQueryDocs = async (query) => {
            const snap = await query.get();
            await Promise.all(snap.docs.map((doc) => doc.ref.delete()));
        };
        const now = new Date();
        const expiresAt = new Date(now.getTime() + invoice_types_1.INVOICE_TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
        const trashId = `invoice_${invoiceId}_${(0, node_crypto_1.randomUUID)().replace(/-/g, '').slice(0, 12)}`;
        const trashRef = this.getBuildingTrashCollection(buildingId).doc(trashId);
        const invoicePath = ref.path;
        let deletedPermanently = false;
        try {
            await this.firebaseAdminService.firestore.runTransaction(async (transaction) => {
                const invoiceSnap = await transaction.get(ref);
                if (!invoiceSnap.exists) {
                    throw new common_1.NotFoundException('Invoice not found');
                }
                const originalInvoiceData = invoiceSnap.data();
                transaction.set(trashRef, {
                    id: trashId,
                    type: 'invoice',
                    originalInvoiceId: invoiceId,
                    originalInvoicePath: invoicePath,
                    invoiceData: {
                        ...originalInvoiceData,
                        id: invoiceId,
                        apartmentId,
                        buildingId,
                        companyId,
                        invoicePath,
                    },
                    apartmentId,
                    buildingId,
                    companyId,
                    externalId: externalId || null,
                    externalIdKey: externalIdKey || null,
                    recipientType,
                    storagePath: storagePath || null,
                    storageBucket: storageBucket || null,
                    pdfUrl: (0, values_1.firstString)(current.pdfUrl) || null,
                    deletedAt: now,
                    deletedByUid: user.uid,
                    deletedByRole: user.role,
                    expiresAt,
                    retentionDays: invoice_types_1.INVOICE_TRASH_RETENTION_DAYS,
                });
                transaction.delete(ref);
                if (externalIdKey && apartmentId) {
                    transaction.delete(this.getApartmentInvoiceExternalIdsCollection(apartmentId).doc(externalIdKey));
                    transaction.delete(this.getApartmentPendingInvoiceExternalIdsCollection(apartmentId).doc(externalIdKey));
                }
            });
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException)
                throw error;
            this.logger.error(`invoice.delete.trash_failed invoiceId=${invoiceId} reason=${(0, values_1.errorMessage)(error)}`);
            try {
                await ref.delete();
                await Promise.all([
                    externalIdKey && apartmentId
                        ? this.getApartmentInvoiceExternalIdsCollection(apartmentId).doc(externalIdKey).delete()
                        : Promise.resolve(),
                    externalIdKey && apartmentId
                        ? this.getApartmentPendingInvoiceExternalIdsCollection(apartmentId).doc(externalIdKey).delete()
                        : Promise.resolve(),
                ]);
            }
            catch (permanentDeleteError) {
                const reason = (0, values_1.errorMessage)(permanentDeleteError);
                this.logger.error(`invoice.delete.permanent_failed invoiceId=${invoiceId} reason=${reason}`);
                if (process.env.NODE_ENV !== 'production') {
                    throw new common_1.BadRequestException(`Invoice could not be deleted: ${reason}`);
                }
                throw permanentDeleteError;
            }
            deletedPermanently = true;
        }
        await Promise.allSettled([
            apartmentId
                ? deleteQueryDocs(this.getApartmentInvoicePublicLinksCollection(apartmentId).where('invoiceId', '==', invoiceId))
                : Promise.resolve(),
            deleteQueryDocs(this.firebaseAdminService.firestore.collection('invoice_public_links').where('invoiceId', '==', invoiceId)),
        ]);
        if (deletedPermanently && storagePath) {
            (0, background_1.runInBackground)((storageBucket
                ? this.firebaseAdminService.storage.bucket(storageBucket)
                : this.firebaseAdminService.storageBucket).file(storagePath).delete({ ignoreNotFound: true }), 'invoice_file_delete');
        }
        (0, background_1.runInBackground)(this.auditLogService.write({
            request,
            action: 'invoice.delete',
            status: 'success',
            actorUid: user.uid,
            actorRole: user.role,
            companyId: targetCompanyId,
            apartmentId: typeof current.apartmentId === 'string' ? current.apartmentId : undefined,
            metadata: {
                invoiceId,
                ...(deletedPermanently ? { deletionMode: 'permanent' } : { trashId, expiresAt: expiresAt.toISOString() }),
                hadPdf: typeof current.pdfUrl === 'string' && current.pdfUrl.length > 0,
                hadStorageFile: Boolean(storagePath),
            },
        }), 'audit');
        return deletedPermanently
            ? { success: true, permanently_deleted: true }
            : { success: true, trash_id: trashId, expires_at: expiresAt.toISOString() };
    }
};
exports.InvoicesService = InvoicesService;
exports.InvoicesService = InvoicesService = InvoicesService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        rate_limit_service_1.RateLimitService,
        audit_log_service_1.AuditLogService,
        email_service_1.EmailService,
        invoice_pdf_storage_service_1.InvoicePdfStorageService,
        invoice_upload_history_service_1.InvoiceUploadHistoryService,
        invoice_zip_extractor_1.InvoiceZipExtractor])
], InvoicesService);
