import { Request } from 'express';

// Types and limits shared by InvoicesService and its helper services.
export const INVOICE_PROTECTED_FIELDS = [
  'apartmentId', 'companyId', 'companyIds', 'buildingId', 'houseId',
  'storagePath', 'storageBucket', 'invoicePath',
  'approvedFromApprovalId', 'uploadHistoryId', 'deletedBy', 'trashId',
] as const;

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

export const MAX_INVOICE_PDF_BYTES = 25 * 1024 * 1024;
export const MAX_INVOICE_BATCH_FILES = 200;
export const INVOICE_BATCH_UPLOAD_CONCURRENCY = 4;
export const INVOICE_TRASH_RETENTION_DAYS = 30;
export const MAX_INVOICE_ZIP_BYTES = 500 * 1024 * 1024;
export const MAX_INVOICE_ZIP_ENTRIES = 250;
export const MAX_INVOICE_ZIP_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;
export const INVOICE_STATUSES = new Set(['draft', 'pending', 'issued', 'paid', 'overdue', 'cancelled']);
export const INVOICE_RECIPIENT_TYPES = new Set<InvoiceRecipientType>(['owner', 'tenant', 'general']);
export const UPLOAD_SOURCES = new Set<InvoiceUploadSource>(['api', 'manual', 'sftp', 'email', 'zip', 'accounting']);
export const ALLOWED_PDF_PROXY_HOSTS = new Set(['firebasestorage.googleapis.com', 'storage.googleapis.com']);
export const INVOICE_METER_READING_KEYS: readonly InvoiceMeterReadingKey[] = ['coldmeterwater', 'hotmeterwater', 'electricitymeter'];

export type InvoicePdfPayload = {
  buffer: Buffer;
  fileName: string;
  contentType: string;
};
