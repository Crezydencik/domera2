import { BadRequestException, Injectable } from '@nestjs/common';
import {
  ALLOWED_MIME_TYPES,
  DOCUMENT_SCOPES,
  DocumentScope,
  UnknownRecord,
  UploadedDocumentFile,
  MAX_DOCUMENT_BYTES,
} from '../types/document.types';

@Injectable()
export class DocumentHelperService {
  firstString(...values: unknown[]): string {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    }

    return '';
  }

  normalizeScope(value: unknown): DocumentScope {
    const raw = this.firstString(value);
    if (!DOCUMENT_SCOPES.has(raw as DocumentScope)) {
      throw new BadRequestException('Invalid document scope');
    }

    return raw as DocumentScope;
  }

  sanitizeFileName(value: unknown): string {
    const name = this.firstString(value, 'document');
    return name.replace(/[/\\?%*:|"<>]/g, '_').trim().slice(0, 180) || 'document';
  }

  buildAsciiDownloadFileName(value: string): string {
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

  buildContentDisposition(fileName: string): string {
    const asciiName = this.buildAsciiDownloadFileName(fileName);
    return `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
  }

  buildAttachmentContentDisposition(fileName: string): string {
    const asciiName = this.buildAsciiDownloadFileName(fileName);
    return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
  }

  sanitizePathSegment(value: string): string {
    return value
      .trim()
      .replace(/[^A-Za-z0-9._-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 120) || 'unknown';
  }

  formatDate(value: unknown): string {
    if (value instanceof Date) return value.toISOString();

    if (value && typeof value === 'object') {
      const record = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
      if (typeof record.toDate === 'function') return record.toDate().toISOString();
      const seconds = typeof record.seconds === 'number' ? record.seconds : record._seconds;
      if (typeof seconds === 'number') return new Date(seconds * 1000).toISOString();
    }

    if (typeof value === 'string' && value.trim()) return value;
    return new Date().toISOString();
  }

  parseOptionalDate(value: unknown): Date | null {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

    if (value && typeof value === 'object') {
      const record = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
      if (typeof record.toDate === 'function') {
        const date = record.toDate();
        return Number.isNaN(date.getTime()) ? null : date;
      }
      const seconds = typeof record.seconds === 'number' ? record.seconds : record._seconds;
      if (typeof seconds === 'number') return new Date(seconds * 1000);
    }

    if (typeof value === 'string' && value.trim()) {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    return null;
  }

  omitUndefined(input: UnknownRecord): UnknownRecord {
    return Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined),
    );
  }

  isApartmentScopedDocument(scope: unknown): boolean {
    return ['apartmentResidents', 'apartmentPrivate', 'privateApartment'].includes(this.firstString(scope));
  }

  validateFile(file: UploadedDocumentFile): void {
    const size = file.size ?? file.buffer?.length ?? 0;
    if (!file.buffer || size <= 0) {
      throw new BadRequestException('File is required');
    }

    if (size > MAX_DOCUMENT_BYTES) {
      throw new BadRequestException('Document file is too large');
    }

    const mimeType = this.detectAllowedMimeType(file.buffer);
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new BadRequestException('Only PDF, DOCX, XLSX, JPG, and PNG files are allowed');
    }
  }

  detectAllowedMimeType(buffer: Buffer): string {
    if (!buffer || buffer.length < 4) {
      throw new BadRequestException('File is required');
    }

    if (buffer.subarray(0, 4).equals(Buffer.from([0x25, 0x50, 0x44, 0x46]))) {
      return 'application/pdf';
    }

    if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
      return 'image/jpeg';
    }

    if (
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    ) {
      return 'image/png';
    }

    if (buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
      const ascii = buffer.subarray(0, Math.min(buffer.length, 8192)).toString('latin1');
      if (ascii.includes('word/')) {
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      }
      if (ascii.includes('xl/')) {
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      }
    }

    throw new BadRequestException('File type not allowed');
  }

  serializeDocument(id: string, data: UnknownRecord) {
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
}
