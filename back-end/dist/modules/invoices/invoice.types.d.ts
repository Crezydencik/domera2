import { Request } from 'express';
export declare const INVOICE_PROTECTED_FIELDS: readonly ["apartmentId", "companyId", "companyIds", "buildingId", "houseId", "storagePath", "storageBucket", "invoicePath", "approvedFromApprovalId", "uploadHistoryId", "deletedBy", "trashId"];
export type UploadedInvoiceFile = {
    fieldname?: string;
    buffer: Buffer;
    originalname?: string;
    mimetype?: string;
    size?: number;
};
export type InvoiceUploadRequest = Request & {
    apiCredential?: {
        id?: string;
        label?: string;
        source?: string;
        buildingId?: string;
        allowedBuildingIds?: string[];
    };
};
export type InvoiceUploadSource = 'api' | 'manual' | 'sftp' | 'email' | 'zip' | 'accounting';
export type InvoiceRecipientType = 'owner' | 'tenant' | 'general';
export type ResolvedApartment = {
    id: string;
    data: Record<string, unknown>;
};
export type UploadHistoryInput = {
    historyId?: string;
    request?: Request;
    status: 'success' | 'error' | 'duplicate' | 'pending' | 'cancelled';
    source: InvoiceUploadSource;
    actorUid?: string;
    actorRole?: string;
    companyId?: string;
    buildingId?: string;
    apartmentId?: string;
    invoiceId?: string;
    externalId?: string;
    fileName?: string;
    fileSize?: number;
    error?: string;
    metadata?: Record<string, unknown>;
};
export type InvoiceDocumentLocation = {
    ref: FirebaseFirestore.DocumentReference;
    data: Record<string, unknown>;
    apartmentId: string;
};
export type PendingInvoiceApprovalLocation = {
    ref: FirebaseFirestore.DocumentReference;
    data: Record<string, unknown>;
    buildingId: string;
};
export type ApartmentInvoiceContext = {
    id: string;
    data: Record<string, unknown>;
};
export type InvoiceMeterReadingKey = 'coldmeterwater' | 'hotmeterwater' | 'electricitymeter';
export declare const MAX_INVOICE_PDF_BYTES: number;
export declare const MAX_INVOICE_BATCH_FILES = 200;
export declare const INVOICE_BATCH_UPLOAD_CONCURRENCY = 4;
export declare const INVOICE_TRASH_RETENTION_DAYS = 30;
export declare const MAX_INVOICE_ZIP_BYTES: number;
export declare const MAX_INVOICE_ZIP_ENTRIES = 250;
export declare const MAX_INVOICE_ZIP_UNCOMPRESSED_BYTES: number;
export declare const INVOICE_STATUSES: Set<string>;
export declare const INVOICE_RECIPIENT_TYPES: Set<InvoiceRecipientType>;
export declare const UPLOAD_SOURCES: Set<InvoiceUploadSource>;
export declare const ALLOWED_PDF_PROXY_HOSTS: Set<string>;
export declare const INVOICE_METER_READING_KEYS: readonly InvoiceMeterReadingKey[];
export type InvoicePdfPayload = {
    buffer: Buffer;
    fileName: string;
    contentType: string;
};
