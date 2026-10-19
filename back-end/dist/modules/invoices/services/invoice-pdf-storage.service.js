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
var InvoicePdfStorageService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvoicePdfStorageService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const firebase_admin_service_1 = require("../../../common/infrastructure/firebase/firebase-admin.service");
const values_1 = require("../../../common/utils/values");
const invoice_types_1 = require("../invoice.types");
let InvoicePdfStorageService = InvoicePdfStorageService_1 = class InvoicePdfStorageService {
    constructor(firebaseAdminService) {
        this.firebaseAdminService = firebaseAdminService;
        this.logger = new common_1.Logger(InvoicePdfStorageService_1.name);
    }
    sanitizePathSegment(value) {
        return value
            .trim()
            .replace(/[^A-Za-z0-9._-]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 120) || 'unknown';
    }
    buildStoragePath(params) {
        return [
            'companies',
            this.sanitizePathSegment(params.companyId),
            'buildings',
            this.sanitizePathSegment(params.buildingId),
            'apartments',
            this.sanitizePathSegment(params.apartmentId),
            'invoices',
            this.sanitizePathSegment(params.period),
            `${this.sanitizePathSegment(params.invoiceId)}.pdf`,
        ].join('/');
    }
    buildPendingApprovalStoragePath(params) {
        return [
            'companies',
            this.sanitizePathSegment(params.companyId),
            'buildings',
            this.sanitizePathSegment(params.buildingId),
            'invoice_approvals',
            `${this.sanitizePathSegment(params.approvalId)}.pdf`,
        ].join('/');
    }
    buildFirebaseDownloadUrl(bucketName, storagePath, token) {
        return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(storagePath)}?alt=media&token=${encodeURIComponent(token)}`;
    }
    sanitizePdfFileName(value) {
        const normalized = value
            .replace(/[\r\n]/g, ' ')
            .replace(/[\\/:*?"<>|]+/g, '-')
            .replace(/\.pdf$/i, '')
            .trim();
        return `${normalized || 'invoice'}.pdf`;
    }
    resolveInvoicePdfFileName(invoice, invoiceId) {
        return this.sanitizePdfFileName((0, values_1.firstString)(invoice.originalFileName, invoice.externalId, invoice.id, invoiceId) || invoiceId);
    }
    asPdfPayload(buffer, fileName) {
        if (buffer.length < 5 || buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
            throw new common_1.NotFoundException('Invoice PDF not found');
        }
        return { buffer, fileName, contentType: 'application/pdf' };
    }
    assertSafeProxyUrl(value) {
        let url;
        try {
            url = new URL(value);
        }
        catch {
            throw new common_1.NotFoundException('Invoice PDF not found');
        }
        if (url.protocol !== 'https:' || !invoice_types_1.ALLOWED_PDF_PROXY_HOSTS.has(url.hostname)) {
            throw new common_1.ForbiddenException('Invoice PDF URL cannot be proxied');
        }
        return url;
    }
    async downloadInvoicePdfFromUrl(pdfUrl, fileName) {
        const url = this.assertSafeProxyUrl(pdfUrl);
        const response = await fetch(url, { redirect: 'error' });
        if (!response.ok) {
            throw new common_1.NotFoundException('Invoice PDF not found');
        }
        const contentLength = Number(response.headers.get('content-length') ?? 0);
        if (Number.isFinite(contentLength) && contentLength > invoice_types_1.MAX_INVOICE_PDF_BYTES) {
            throw new common_1.BadRequestException('Invoice PDF is too large');
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length > invoice_types_1.MAX_INVOICE_PDF_BYTES) {
            throw new common_1.BadRequestException('Invoice PDF is too large');
        }
        return this.asPdfPayload(buffer, fileName);
    }
    async resolveInvoicePdfPayload(invoice, invoiceId) {
        const fileName = this.resolveInvoicePdfFileName(invoice, invoiceId);
        const storagePath = (0, values_1.firstString)(invoice.storagePath);
        const pdfUrl = (0, values_1.firstString)(invoice.pdfUrl);
        const approvedFromApprovalId = (0, values_1.firstString)(invoice.approvedFromApprovalId);
        const restoredPendingApprovalPath = approvedFromApprovalId
            ? this.buildPendingApprovalStoragePath({
                companyId: (0, values_1.firstString)(invoice.companyId),
                buildingId: (0, values_1.firstString)(invoice.buildingId),
                approvalId: approvedFromApprovalId,
            })
            : '';
        const storagePaths = Array.from(new Set([storagePath, restoredPendingApprovalPath].filter(Boolean)));
        const companyPrefix = `companies/${this.sanitizePathSegment((0, values_1.firstString)(invoice.companyId))}/`;
        const defaultBucketName = this.firebaseAdminService.storageBucket.name;
        for (const candidateStoragePath of storagePaths) {
            const storageBucket = (0, values_1.firstString)(invoice.storageBucket);
            if (!candidateStoragePath.startsWith(companyPrefix)
                || candidateStoragePath.includes('..')
                || (storageBucket && storageBucket !== defaultBucketName)) {
                this.logger.warn(`invoice.pdf.storage_path_rejected invoiceId=${invoiceId} path=${candidateStoragePath}`);
                continue;
            }
            const bucket = storageBucket
                ? this.firebaseAdminService.storage.bucket(storageBucket)
                : this.firebaseAdminService.storageBucket;
            const file = bucket.file(candidateStoragePath);
            try {
                const [metadata] = await file.getMetadata();
                const size = Number(metadata.size ?? 0);
                if (Number.isFinite(size) && size > invoice_types_1.MAX_INVOICE_PDF_BYTES) {
                    throw new common_1.BadRequestException('Invoice PDF is too large');
                }
                const [buffer] = await file.download();
                return this.asPdfPayload(buffer, fileName);
            }
            catch (error) {
                if (error instanceof common_1.BadRequestException) {
                    throw error;
                }
                this.logger.warn(`invoice.pdf.storage_download_failed invoiceId=${invoiceId} path=${candidateStoragePath} reason=${(0, values_1.errorMessage)(error)}`);
            }
        }
        if (!pdfUrl) {
            throw new common_1.NotFoundException('Invoice PDF not found');
        }
        return this.downloadInvoicePdfFromUrl(pdfUrl, fileName);
    }
    async saveInvoicePdf(params) {
        const bucket = this.firebaseAdminService.storageBucket;
        const downloadToken = (0, node_crypto_1.randomUUID)();
        await bucket.file(params.storagePath).save(params.file.buffer, {
            resumable: false,
            metadata: {
                contentType: 'application/pdf',
                contentDisposition: `inline; filename="${params.originalFileName.replace(/"/g, '')}"`,
                metadata: {
                    firebaseStorageDownloadTokens: downloadToken,
                    externalId: params.externalId,
                    invoiceId: params.invoiceId,
                },
            },
        });
        return {
            bucket: bucket.name,
            storagePath: params.storagePath,
            pdfUrl: this.buildFirebaseDownloadUrl(bucket.name, params.storagePath, downloadToken),
        };
    }
};
exports.InvoicePdfStorageService = InvoicePdfStorageService;
exports.InvoicePdfStorageService = InvoicePdfStorageService = InvoicePdfStorageService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService])
], InvoicePdfStorageService);
