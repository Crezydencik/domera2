import { Request } from 'express';
import { RequestUser } from '../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../common/infrastructure/firebase/firebase-admin.service';
import { RateLimitService } from '../../common/services/rate-limit.service';
import { AuditLogService } from '../../common/services/audit-log.service';
import { EmailService } from '../emails/email.service';
type UploadedInvoiceFile = {
    fieldname?: string;
    buffer: Buffer;
    originalname?: string;
    mimetype?: string;
    size?: number;
};
type InvoicePdfPayload = {
    buffer: Buffer;
    fileName: string;
    contentType: string;
};
export declare class InvoicesService {
    private readonly firebaseAdminService;
    private readonly rateLimitService;
    private readonly auditLogService;
    private readonly emailService;
    private readonly logger;
    constructor(firebaseAdminService: FirebaseAdminService, rateLimitService: RateLimitService, auditLogService: AuditLogService, emailService: EmailService);
    private assertAuthenticated;
    private isStaff;
    private requireStaffCompanyId;
    private firstString;
    private normalizeSource;
    private normalizeStatus;
    private parseAmount;
    private normalizeCurrency;
    private parseDate;
    private parseBillingPeriod;
    private validatePdfFile;
    private normalizeFileName;
    private normalizeLookupValue;
    private sanitizePathSegment;
    private buildInvoiceId;
    private hashExternalId;
    private extractCompanyIds;
    private getApiKeyBuildingIds;
    private apiCredentialMetadata;
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
    private getStaffInvoiceApartmentContexts;
    private findInvoiceDocument;
    private resolveTargetCompanyId;
    private resolveResidentContext;
    private buildStoragePath;
    private buildPendingApprovalStoragePath;
    private buildFirebaseDownloadUrl;
    private sanitizePdfFileName;
    private resolveInvoicePdfFileName;
    private assertSafeProxyUrl;
    private downloadInvoicePdfFromUrl;
    private resolveInvoicePdfPayload;
    private hashPublicInvoiceToken;
    private resolvePublicAppBaseUrl;
    private createPublicInvoicePdfLink;
    publicInvoiceViewLink(token: string, request: Request): string;
    private resolveInvoiceEmailLanguage;
    private resolveInvoiceEmailAmount;
    private sendApprovedInvoiceEmail;
    private saveInvoicePdf;
    private errorMessage;
    private parseJson;
    private isZipFile;
    private pathBaseName;
    private findZipEndOfCentralDirectory;
    private readZipEntryContent;
    private extractZipInvoiceBatch;
    private expandBatchArchives;
    private parseBatchItems;
    private parseFileIndex;
    private resolveBatchFile;
    private writeUploadHistory;
    private uploadHistoryStatusFromResults;
    private updateUploadHistoryForApproval;
    private reconcileUploadHistoryDoc;
    private firestoreDateToIso;
    private firestoreDateToMillis;
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
    approvePendingApproval(request: Request, user: RequestUser, approvalId: string): Promise<{
        success: boolean;
        invoice_id: string;
        message: string;
    }>;
    cancelPendingApproval(request: Request, user: RequestUser, approvalId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    private normalizeApprovalIds;
    approvePendingApprovals(request: Request, user: RequestUser, payload: Record<string, unknown>): Promise<{
        success: boolean;
        total: number;
        processed: number;
        failed: number;
        results: {
            approval_id: string;
            success: boolean;
            invoice_id?: string;
            error?: string;
        }[];
    }>;
    cancelPendingApprovals(request: Request, user: RequestUser, payload: Record<string, unknown>): Promise<{
        success: boolean;
        total: number;
        processed: number;
        failed: number;
        results: {
            approval_id: string;
            success: boolean;
            error?: string;
        }[];
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
            status: string;
            pdfUrl: string;
            companyId: string;
            buildingId: string | null;
            createdAt: Date;
            createdByUid: string;
        };
    }>;
    list(user: RequestUser, query: Record<string, string | undefined>): Promise<{
        items: Record<string, unknown>[];
        query: Record<string, string | undefined>;
    }>;
    byId(user: RequestUser, invoiceId: string): Promise<{
        apartmentId: string | undefined;
        id: string;
    }>;
    pdf(user: RequestUser, invoiceId: string): Promise<InvoicePdfPayload>;
    publicPdf(token: string): Promise<InvoicePdfPayload>;
    resendEmail(request: Request, user: RequestUser, invoiceId: string): Promise<{
        success: boolean;
    }>;
    update(request: Request, user: RequestUser, invoiceId: string, payload: Record<string, unknown>): Promise<{
        success: boolean;
    }>;
    remove(request: Request, user: RequestUser, invoiceId: string): Promise<{
        success: boolean;
    }>;
}
export {};
