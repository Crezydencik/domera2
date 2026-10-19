import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { firstString, errorMessage } from '../../../common/utils/values';
import { MAX_INVOICE_PDF_BYTES, ALLOWED_PDF_PROXY_HOSTS } from '../invoice.types';
import type { UploadedInvoiceFile, InvoicePdfPayload } from '../invoice.types';

@Injectable()
export class InvoicePdfStorageService {
  private readonly logger = new Logger(InvoicePdfStorageService.name);

  constructor(private readonly firebaseAdminService: FirebaseAdminService) {}

  sanitizePathSegment(value: string): string {
    return value
      .trim()
      .replace(/[^A-Za-z0-9._-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 120) || 'unknown';
  }

  buildStoragePath(params: {
    companyId: string;
    buildingId: string;
    apartmentId: string;
    period: string;
    invoiceId: string;
  }): string {
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

  buildPendingApprovalStoragePath(params: {
    companyId: string;
    buildingId: string;
    approvalId: string;
  }): string {
    return [
      'companies',
      this.sanitizePathSegment(params.companyId),
      'buildings',
      this.sanitizePathSegment(params.buildingId),
      'invoice_approvals',
      `${this.sanitizePathSegment(params.approvalId)}.pdf`,
    ].join('/');
  }

  buildFirebaseDownloadUrl(bucketName: string, storagePath: string, token: string): string {
    return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(storagePath)}?alt=media&token=${encodeURIComponent(token)}`;
  }

  sanitizePdfFileName(value: string): string {
    const normalized = value
      .replace(/[\r\n]/g, ' ')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\.pdf$/i, '')
      .trim();

    return `${normalized || 'invoice'}.pdf`;
  }

  resolveInvoicePdfFileName(invoice: Record<string, unknown>, invoiceId: string): string {
    return this.sanitizePdfFileName(
      firstString(invoice.originalFileName, invoice.externalId, invoice.id, invoiceId) || invoiceId,
    );
  }

  /**
   * Served inline from the API origin, so the bytes must really be a PDF: the content type used to
   * come from the remote/stored metadata, and a client-set pdfUrl pointing to a public HTML object
   * on an allow-listed host was rendered as HTML (script) on the API origin with the viewer's cookies.
   */
  asPdfPayload(buffer: Buffer, fileName: string): InvoicePdfPayload {
    if (buffer.length < 5 || buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
      throw new NotFoundException('Invoice PDF not found');
    }
    return { buffer, fileName, contentType: 'application/pdf' };
  }

  assertSafeProxyUrl(value: string): URL {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new NotFoundException('Invoice PDF not found');
    }

    if (url.protocol !== 'https:' || !ALLOWED_PDF_PROXY_HOSTS.has(url.hostname)) {
      throw new ForbiddenException('Invoice PDF URL cannot be proxied');
    }

    return url;
  }

  async downloadInvoicePdfFromUrl(pdfUrl: string, fileName: string): Promise<InvoicePdfPayload> {
    const url = this.assertSafeProxyUrl(pdfUrl);
    // No redirects: the allow-listed host must be the one that actually serves the bytes.
    const response = await fetch(url, { redirect: 'error' });

    if (!response.ok) {
      throw new NotFoundException('Invoice PDF not found');
    }

    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_INVOICE_PDF_BYTES) {
      throw new BadRequestException('Invoice PDF is too large');
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_INVOICE_PDF_BYTES) {
      throw new BadRequestException('Invoice PDF is too large');
    }

    return this.asPdfPayload(buffer, fileName);
  }

  async resolveInvoicePdfPayload(invoice: Record<string, unknown>, invoiceId: string): Promise<InvoicePdfPayload> {
    const fileName = this.resolveInvoicePdfFileName(invoice, invoiceId);
    const storagePath = firstString(invoice.storagePath);
    const pdfUrl = firstString(invoice.pdfUrl);
    const approvedFromApprovalId = firstString(invoice.approvedFromApprovalId);
    const restoredPendingApprovalPath = approvedFromApprovalId
      ? this.buildPendingApprovalStoragePath({
          companyId: firstString(invoice.companyId),
          buildingId: firstString(invoice.buildingId),
          approvalId: approvedFromApprovalId,
        })
      : '';
    const storagePaths = Array.from(new Set([storagePath, restoredPendingApprovalPath].filter(Boolean)));

    const companyPrefix = `companies/${this.sanitizePathSegment(firstString(invoice.companyId))}/`;
    const defaultBucketName = this.firebaseAdminService.storageBucket.name;
    for (const candidateStoragePath of storagePaths) {
      const storageBucket = firstString(invoice.storageBucket);
      // Defense in depth for records written before the update() fix: only files of the
      // invoice's own company, in the default bucket, are served.
      if (
        !candidateStoragePath.startsWith(companyPrefix)
        || candidateStoragePath.includes('..')
        || (storageBucket && storageBucket !== defaultBucketName)
      ) {
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
        if (Number.isFinite(size) && size > MAX_INVOICE_PDF_BYTES) {
          throw new BadRequestException('Invoice PDF is too large');
        }

        const [buffer] = await file.download();
        return this.asPdfPayload(buffer, fileName);
      } catch (error) {
        if (error instanceof BadRequestException) {
          throw error;
        }

        this.logger.warn(`invoice.pdf.storage_download_failed invoiceId=${invoiceId} path=${candidateStoragePath} reason=${errorMessage(error)}`);
      }
    }

    if (!pdfUrl) {
      throw new NotFoundException('Invoice PDF not found');
    }

    return this.downloadInvoicePdfFromUrl(pdfUrl, fileName);
  }

  async saveInvoicePdf(params: {
    file: UploadedInvoiceFile;
    storagePath: string;
    externalId: string;
    invoiceId: string;
    originalFileName: string;
  }) {
    const bucket = this.firebaseAdminService.storageBucket;
    const downloadToken = randomUUID();
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
}
