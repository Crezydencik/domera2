"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentHelperService = void 0;
const common_1 = require("@nestjs/common");
const document_types_1 = require("../types/document.types");
let DocumentHelperService = class DocumentHelperService {
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
        if (!document_types_1.DOCUMENT_SCOPES.has(raw)) {
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
    validateFile(file) {
        const size = file.size ?? file.buffer?.length ?? 0;
        if (!file.buffer || size <= 0) {
            throw new common_1.BadRequestException('File is required');
        }
        if (size > document_types_1.MAX_DOCUMENT_BYTES) {
            throw new common_1.BadRequestException('Document file is too large');
        }
        const mimeType = this.firstString(file.mimetype).toLowerCase();
        if (!document_types_1.ALLOWED_MIME_TYPES.has(mimeType)) {
            throw new common_1.BadRequestException('Only PDF, DOC, DOCX, JPG, and PNG files are allowed');
        }
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
};
exports.DocumentHelperService = DocumentHelperService;
exports.DocumentHelperService = DocumentHelperService = __decorate([
    (0, common_1.Injectable)()
], DocumentHelperService);
