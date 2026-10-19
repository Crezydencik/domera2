import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import type { UploadedInvoiceFile, InvoicePdfPayload } from '../invoice.types';
export declare class InvoicePdfStorageService {
    private readonly firebaseAdminService;
    private readonly logger;
    constructor(firebaseAdminService: FirebaseAdminService);
    sanitizePathSegment(value: string): string;
    buildStoragePath(params: {
        companyId: string;
        buildingId: string;
        apartmentId: string;
        period: string;
        invoiceId: string;
    }): string;
    buildPendingApprovalStoragePath(params: {
        companyId: string;
        buildingId: string;
        approvalId: string;
    }): string;
    buildFirebaseDownloadUrl(bucketName: string, storagePath: string, token: string): string;
    sanitizePdfFileName(value: string): string;
    resolveInvoicePdfFileName(invoice: Record<string, unknown>, invoiceId: string): string;
    asPdfPayload(buffer: Buffer, fileName: string): InvoicePdfPayload;
    assertSafeProxyUrl(value: string): URL;
    downloadInvoicePdfFromUrl(pdfUrl: string, fileName: string): Promise<InvoicePdfPayload>;
    resolveInvoicePdfPayload(invoice: Record<string, unknown>, invoiceId: string): Promise<InvoicePdfPayload>;
    saveInvoicePdf(params: {
        file: UploadedInvoiceFile;
        storagePath: string;
        externalId: string;
        invoiceId: string;
        originalFileName: string;
    }): Promise<{
        bucket: string;
        storagePath: string;
        pdfUrl: string;
    }>;
}
