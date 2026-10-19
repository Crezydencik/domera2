"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INVOICE_METER_READING_KEYS = exports.ALLOWED_PDF_PROXY_HOSTS = exports.UPLOAD_SOURCES = exports.INVOICE_RECIPIENT_TYPES = exports.INVOICE_STATUSES = exports.MAX_INVOICE_ZIP_UNCOMPRESSED_BYTES = exports.MAX_INVOICE_ZIP_ENTRIES = exports.MAX_INVOICE_ZIP_BYTES = exports.INVOICE_TRASH_RETENTION_DAYS = exports.INVOICE_BATCH_UPLOAD_CONCURRENCY = exports.MAX_INVOICE_BATCH_FILES = exports.MAX_INVOICE_PDF_BYTES = exports.INVOICE_PROTECTED_FIELDS = void 0;
exports.INVOICE_PROTECTED_FIELDS = [
    'apartmentId', 'companyId', 'companyIds', 'buildingId', 'houseId',
    'storagePath', 'storageBucket', 'invoicePath',
    'approvedFromApprovalId', 'uploadHistoryId', 'deletedBy', 'trashId',
];
exports.MAX_INVOICE_PDF_BYTES = 25 * 1024 * 1024;
exports.MAX_INVOICE_BATCH_FILES = 200;
exports.INVOICE_BATCH_UPLOAD_CONCURRENCY = 4;
exports.INVOICE_TRASH_RETENTION_DAYS = 30;
exports.MAX_INVOICE_ZIP_BYTES = 500 * 1024 * 1024;
exports.MAX_INVOICE_ZIP_ENTRIES = 250;
exports.MAX_INVOICE_ZIP_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;
exports.INVOICE_STATUSES = new Set(['draft', 'pending', 'issued', 'paid', 'overdue', 'cancelled']);
exports.INVOICE_RECIPIENT_TYPES = new Set(['owner', 'tenant', 'general']);
exports.UPLOAD_SOURCES = new Set(['api', 'manual', 'sftp', 'email', 'zip', 'accounting']);
exports.ALLOWED_PDF_PROXY_HOSTS = new Set(['firebasestorage.googleapis.com', 'storage.googleapis.com']);
exports.INVOICE_METER_READING_KEYS = ['coldmeterwater', 'hotmeterwater', 'electricitymeter'];
