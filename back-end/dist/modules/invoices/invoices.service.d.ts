import { Request } from 'express';
import { RequestUser } from '../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../common/infrastructure/firebase/firebase-admin.service';
import { RateLimitService } from '../../common/services/rate-limit.service';
import { AuditLogService } from '../../common/services/audit-log.service';
import { EmailService } from '../emails/services/email.service';
import type { UploadedInvoiceFile, InvoiceRecipientType, InvoicePdfPayload } from './invoice.types';
import { InvoicePdfStorageService } from './services/invoice-pdf-storage.service';
import { InvoiceUploadHistoryService } from './services/invoice-upload-history.service';
import { InvoiceZipExtractor } from './services/invoice-zip-extractor';
export declare class InvoicesService {
    private readonly firebaseAdminService;
    private readonly rateLimitService;
    private readonly auditLogService;
    private readonly emailService;
    private readonly pdfStorage;
    private readonly uploadHistory;
    private readonly zipExtractor;
    private readonly logger;
    constructor(firebaseAdminService: FirebaseAdminService, rateLimitService: RateLimitService, auditLogService: AuditLogService, emailService: EmailService, pdfStorage: InvoicePdfStorageService, uploadHistory: InvoiceUploadHistoryService, zipExtractor: InvoiceZipExtractor);
    private assertAuthenticated;
    private isStaff;
    private requireStaffCompanyId;
    private normalizeSource;
    private normalizeStatus;
    private normalizeRecipientType;
    private externalDedupeValue;
    private isActiveTenantRecord;
    private hasActiveTenant;
    private hasActiveOwner;
    private resolveEffectiveRecipientType;
    private assertRecipientTypeAllowed;
    private parseAmount;
    private normalizeCurrency;
    private parseDate;
    private parseBillingPeriod;
    private validatePdfFile;
    private normalizeFileName;
    private normalizeLookupValue;
    private buildInvoiceId;
    private hashExternalId;
    private extractCompanyIds;
    private getCompanyApartmentContexts;
    private getApiKeyBuildingIds;
    private resolveLookupBuildingId;
    private findApartmentByField;
    private apartmentHasContractNumber;
    private scanBuildingForContractNumber;
    private resolveApartment;
    private resolveBuildingId;
    private assertApiKeyCanAccessBuilding;
    private getBuildingCompanyId;
    private getCompanyBuildingIds;
    private getApartmentInvoiceCollection;
    private getApartmentInvoiceExternalIdsCollection;
    private getApartmentPendingInvoiceExternalIdsCollection;
    private getApartmentInvoicePublicLinksCollection;
    private removeLinkedMeterReading;
    private getBuildingTrashCollection;
    private resolveInvoiceApartmentId;
    private invoiceApartmentCompanyId;
    private parseOptionalDate;
    private invoiceDateRange;
    private memberAccessForApartment;
    private isInvoiceVisibleForPropertyMember;
    private apartmentMatchesInvoiceFilters;
    private invoiceItemFromDoc;
    private invoiceLocationFromDoc;
    private invoiceLocationFromSnapshot;
    private findInvoiceDocumentInApartments;
    private activeExternalMarkerId;
    private shouldQueueInvoiceApproval;
    private pendingApprovalItemFromDoc;
    private getPendingApprovalBuildingIds;
    private findPendingApprovalDocument;
    private assertNoPendingApprovalsForApiUpload;
    private getStaffInvoiceApartmentContexts;
    private findInvoiceDocument;
    private resolveTargetCompanyId;
    private resolveResidentContext;
    private resolvePublicAppBaseUrl;
    private authenticatedInvoiceViewLink;
    private resolveInvoiceEmailLanguage;
    private resolveInvoiceEmailAmount;
    private resolveInvoiceRecipient;
    private sendApprovedInvoiceEmail;
    private parseJson;
    private expandBatchArchives;
    private parseBatchItems;
    private parseFileIndex;
    private resolveBatchFile;
    private hasApartmentLookup;
    private mergeBatchItemPayload;
    upload(request: Request, user: RequestUser, file: UploadedInvoiceFile, payload: Record<string, unknown>): Promise<{
        success: boolean;
        approval_id: string;
        company_id: string;
        building_id: string;
        apartment_id: string;
        message: string;
        invoice_id?: undefined;
    } | {
        success: boolean;
        invoice_id: string;
        company_id: string;
        building_id: string;
        apartment_id: string;
        message: string;
        approval_id?: undefined;
    }>;
    listPendingApprovals(user: RequestUser, query: Record<string, string | undefined>): Promise<{
        items: Record<string, unknown>[];
    }>;
    pendingApprovalPdf(user: RequestUser, approvalId: string): Promise<InvoicePdfPayload>;
    approvePendingApproval(request: Request, user: RequestUser, approvalId: string, options?: Record<string, unknown>): Promise<{
        success: boolean;
        invoice_id: string;
        message: string;
    }>;
    cancelPendingApproval(request: Request, user: RequestUser, approvalId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    private normalizeApprovalIds;
    private processApprovalIds;
    approvePendingApprovals(request: Request, user: RequestUser, payload: Record<string, unknown>): Promise<{
        success: boolean;
        total: number;
        processed: number;
        failed: number;
        results: ({
            approval_id: string;
            success: boolean;
            invoice_id: string | undefined;
            error?: undefined;
        } | {
            approval_id: string;
            success: boolean;
            error: string;
            invoice_id?: undefined;
        })[];
    }>;
    cancelPendingApprovals(request: Request, user: RequestUser, payload: Record<string, unknown>): Promise<{
        success: boolean;
        total: number;
        processed: number;
        failed: number;
        results: ({
            approval_id: string;
            success: boolean;
            error?: undefined;
        } | {
            approval_id: string;
            success: boolean;
            error: string;
        })[];
    }>;
    uploadBatch(request: Request, user: RequestUser, files: UploadedInvoiceFile[], payload: Record<string, unknown>): Promise<{
        success: boolean;
        batch_id: string;
        total: number;
        processed: number;
        failed: number;
        message: string;
        results: {
            index: number;
            fileName: string;
            success: boolean;
            invoice_id?: string;
            approval_id?: string;
            company_id?: string;
            building_id?: string;
            apartment_id?: string;
            message?: string;
            error?: string;
        }[];
    }>;
    listUploadHistory(user: RequestUser, query: Record<string, string | undefined>): Promise<{
        items: Record<string, unknown>[];
    }>;
    private getAccessibleApartmentIds;
    create(request: Request, user: RequestUser, payload: Record<string, unknown>): Promise<{
        success: boolean;
        invoice: {
            id: string;
            apartmentId: string;
            month: number;
            year: number;
            amount: number;
            currency: string;
            externalId: string | null;
            meterReadingId: string | null;
            period: string | null;
            invoiceDate: Date;
            dueDate: Date;
            comment: string;
            status: string;
            pdfUrl: string;
            companyId: string;
            buildingId: string | null;
            recipientType: InvoiceRecipientType;
            createdAt: Date;
            createdByUid: string;
        };
    }>;
    list(user: RequestUser, query: Record<string, string | undefined>): Promise<{
        query: Record<string, string | undefined>;
        items: Array<Record<string, unknown>>;
        nextCursor: string | null;
    } | {
        items: Record<string, unknown>[];
        query: Record<string, string | undefined>;
    }>;
    private listStaffInvoicesViaCollectionGroup;
    private encodeInvoiceCursor;
    private decodeInvoiceCursor;
    private isMissingIndexError;
    byId(user: RequestUser, invoiceId: string, includePdfUrl?: boolean): Promise<Record<string, unknown>>;
    pdf(user: RequestUser, invoiceId: string): Promise<InvoicePdfPayload>;
    resendEmail(request: Request, user: RequestUser, invoiceId: string): Promise<{
        success: boolean;
    }>;
    update(request: Request, user: RequestUser, invoiceId: string, payload: Record<string, unknown>): Promise<{
        success: boolean;
    }>;
    private findInvoiceTrashDocument;
    listTrash(user: RequestUser, query: Record<string, string | undefined>): Promise<{
        items: {
            id: string;
        }[];
        query: Record<string, string | undefined>;
    }>;
    restoreTrash(request: Request, user: RequestUser, trashId: string): Promise<{
        success: boolean;
        invoice_id: string;
    }>;
    purgeTrash(request: Request, user: RequestUser, trashId: string): Promise<{
        success: boolean;
    }>;
    remove(request: Request, user: RequestUser, invoiceId: string): Promise<{
        success: boolean;
        permanently_deleted: boolean;
        trash_id?: undefined;
        expires_at?: undefined;
    } | {
        success: boolean;
        trash_id: string;
        expires_at: string;
        permanently_deleted?: undefined;
    }>;
}
