import { Request } from 'express';
import { RequestUser } from '../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../common/infrastructure/firebase/firebase-admin.service';
import { AuditLogService } from '../../common/services/audit-log.service';
import { RateLimitService } from '../../common/services/rate-limit.service';
import { EmailService } from '../emails/email.service';
type ImportInput = {
    request: Request;
    user: RequestUser;
    file: {
        buffer: Buffer;
        originalname?: string;
        mimetype?: string;
        size?: number;
    };
    buildingId?: string;
    companyId?: string;
};
export declare class ApartmentsService {
    private readonly firebaseAdminService;
    private readonly rateLimitService;
    private readonly auditLogService;
    private readonly emailService;
    constructor(firebaseAdminService: FirebaseAdminService, rateLimitService: RateLimitService, auditLogService: AuditLogService, emailService: EmailService);
    private enforceRateLimit;
    private firstString;
    private getBuildingStorageFolders;
    private getApartmentStorageFolders;
    private getApartmentStorageFolderPath;
    private resolveApartmentStorageContext;
    private markStorageFolders;
    private getApprovedBuildingOrThrow;
    private assertApartmentBuildingEditableForStaff;
    private assertAuthenticated;
    private isStaff;
    private getAccessibleApartmentIds;
    private canManageTenants;
    private hasApartmentOccupant;
    private normalizeHeader;
    private normalizeApartmentNumber;
    private normalizeReadingConfigOverride;
    private buildEmptyWaterReadings;
    private buildReadableCode;
    private buildRandomDigits;
    private resolveFrontendUrl;
    private buildInvitationLink;
    private buildInvitationActionHref;
    private resolveApartmentCompanyId;
    private createApartmentInvitation;
    private resolveOwnerInvitationContext;
    private createOwnerInvitationNotification;
    private createTenantInvitationNotification;
    private getPlatformAdminDocs;
    private emailPlatformAdminsAboutApartmentRequest;
    private buildApartmentNumberCode;
    private generateApartmentReadableId;
    private getCellStringByHeader;
    private parseReadingPeriod;
    private parsePeriodFromDateCell;
    private extractReadings;
    private buildSubmittedAtFromPeriod;
    private findDueDateFromRow;
    private buildWaterReadingGroup;
    private getFileExtension;
    private getValueByPath;
    private asStructuredObject;
    private asStructuredArray;
    private sanitizeImportedText;
    private makeUniqueImportHeaders;
    private appendStructuredWaterReadings;
    private looksLikeImportEntry;
    private extractImportEntries;
    private normalizeStructuredImportRow;
    private parseJsonImportRows;
    private parseXmlImportRows;
    private parseCsvImportRows;
    private parseXlsxImportRows;
    private parseImportRows;
    importFromFile(input: ImportInput): Promise<{
        success: boolean;
        results: {
            imported: number;
            errors: string[];
            skippedDuplicates: string[];
            createdApartments: string[];
        };
    }>;
    private mapApartmentDoc;
    list(request: Request, user: RequestUser, query: Record<string, unknown>): Promise<{
        items: {
            createdAt: Date | undefined;
            id: string;
        }[];
    }>;
    byId(request: Request, user: RequestUser, apartmentId: string): Promise<{
        createdAt: Date | undefined;
        id: string;
    }>;
    create(request: Request, user: RequestUser, payload: Record<string, unknown>): Promise<{
        createdAt: Date;
        updatedAt: Date;
        waterReadings?: Record<string, unknown> | undefined;
        readingConfigOverride?: {
            useBuildingDefaults: boolean;
            hotWaterMeters: number;
            coldWaterMeters: number;
        } | undefined;
        number: string;
        buildingId: string;
        companyIds: string[];
        readableId: string;
        id: string;
    }>;
    update(request: Request, user: RequestUser, apartmentId: string, payload: Record<string, unknown>): Promise<{
        success: boolean;
    }>;
    storageSummary(request: Request, user: RequestUser, apartmentId: string): Promise<{
        path: string;
        fileCount: number;
        hasUserFiles: boolean;
    } | {
        path: null;
        fileCount: number;
        hasUserFiles: boolean;
    }>;
    remove(request: Request, user: RequestUser, apartmentId: string): Promise<{
        success: boolean;
    }>;
    unassignResident(request: Request, user: RequestUser, apartmentId: string): Promise<{
        success: boolean;
    }>;
    updateOwner(request: Request, user: RequestUser, apartmentId: string, ownerEmail: string, ownerData?: {
        firstName?: string;
        lastName?: string;
        contractNumber?: string;
    }): Promise<{
        success: boolean;
    }>;
    removeOwner(request: Request, user: RequestUser, apartmentId: string): Promise<{
        success: boolean;
    }>;
    addOrInviteTenant(request: Request, user: RequestUser, apartmentId: string, emailInput: string, tenantData?: {
        firstName?: string;
        lastName?: string;
        phone?: string;
        contractNumber?: string;
        fromDate?: string;
        until?: string;
        canViewDocuments?: boolean;
    }): Promise<{
        success: boolean;
        invitationLink: string;
        invitationId: string;
    }>;
    removeTenant(request: Request, user: RequestUser, apartmentId: string, userId: string): Promise<{
        success: boolean;
    }>;
    updateTenant(request: Request, user: RequestUser, apartmentId: string, userId: string, tenantData: {
        firstName?: string;
        lastName?: string;
        phone?: string;
        fromDate?: string;
        until?: string;
        status?: string;
        canViewDocuments?: boolean;
    }): Promise<{
        success: boolean;
    }>;
    resendOwnerInvitation(request: Request, user: RequestUser, apartmentId: string, ownerEmail: string): Promise<{
        success: boolean;
    }>;
    resendTenantInvitation(request: Request, user: RequestUser, apartmentId: string, tenantEmail: string): Promise<{
        success: boolean;
    }>;
    getAuditLogs(request: Request, user: RequestUser, apartmentId: string, limit?: number): Promise<{
        items: {
            createdAt: any;
            id: string;
        }[];
    }>;
    migrateApartmentReadableIds(): Promise<{
        updated: number;
        total: number;
    }>;
}
export {};
