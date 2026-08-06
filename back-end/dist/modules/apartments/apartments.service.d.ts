import { Request } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { RequestUser } from '../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../common/infrastructure/firebase/firebase-admin.service';
import { AuditLogService } from '../../common/services/audit-log.service';
import { RateLimitService } from '../../common/services/rate-limit.service';
import { EmailService } from '../emails/services/email.service';
import { CreateApartmentDto, UpdateApartmentDto } from './dto/create-apartment.dto';
import { ApartmentsRepository } from './repositories/apartments.repository';
import { ApartmentAccessService } from './services/apartment-access.service';
import { ApartmentCodeService } from './services/apartment-code.service';
import { ApartmentInvitationService } from './services/apartment-invitation.service';
import { ApartmentMeterService } from './services/apartment-meter.service';
import { ApartmentStorageService } from './services/apartment-storage.service';
import { ImportInput } from './types/import.types';
export declare class ApartmentsService {
    private readonly firebaseAdminService;
    private readonly rateLimitService;
    private readonly auditLogService;
    private readonly emailService;
    private readonly apartmentsRepository;
    private readonly apartmentAccessService;
    private readonly apartmentCodeService;
    private readonly apartmentInvitationService;
    private readonly apartmentMeterService;
    private readonly apartmentStorageService;
    private readonly logger;
    constructor(firebaseAdminService: FirebaseAdminService, rateLimitService: RateLimitService, auditLogService: AuditLogService, emailService: EmailService, apartmentsRepository: ApartmentsRepository, apartmentAccessService: ApartmentAccessService, apartmentCodeService: ApartmentCodeService, apartmentInvitationService: ApartmentInvitationService, apartmentMeterService: ApartmentMeterService, apartmentStorageService: ApartmentStorageService);
    private enforceRateLimit;
    private firstString;
    private compareApartmentOrder;
    private sortApartmentItems;
    private timestampMillis;
    private withOwnerInvitationDates;
    private withResolvedOwnerAccess;
    private getBuildingStorageFolders;
    private getApartmentStorageFolders;
    private getApartmentStorageFolderPath;
    private resolveApartmentStorageContext;
    private markStorageFolders;
    private getApprovedBuildingOrThrow;
    private getBuildingApartmentLimit;
    private countBuildingApartments;
    private assertBuildingApartmentCapacity;
    private assertApartmentBuildingEditableForStaff;
    private assertAuthenticated;
    private isStaff;
    private effectiveStaffCompanyId;
    private apartmentBelongsToStaffCompany;
    private assertApartmentCompanyAccess;
    private getAccessibleApartmentIds;
    private canManageTenants;
    private hasApartmentOccupant;
    private normalizeHeader;
    private normalizeApartmentNumber;
    private normalizeReadingConfigOverride;
    private buildEmptyWaterReadings;
    private buildReadableCode;
    private buildRandomDigits;
    private buildApartmentNumberCode;
    private getApartmentCodeContext;
    private buildApartmentReadableId;
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
            ownerActivated: boolean;
            createdAt: Date | undefined;
            id: string;
        }[];
    }>;
    byId(request: Request, user: RequestUser, apartmentId: string): Promise<{
        ownerActivated: boolean;
        createdAt: Date | undefined;
        id: string;
    }>;
    create(request: Request, user: RequestUser, payload: CreateApartmentDto): Promise<{
        createdAt: FieldValue;
        updatedAt: FieldValue;
        waterReadings?: Record<string, unknown> | undefined;
        readingConfigOverride?: import("./types/apartment.types").ReadingConfigOverride | undefined;
        declaredResidents?: number | undefined;
        area?: number | undefined;
        floor?: number | undefined;
        address?: string | undefined;
        number: string;
        normalizedNumber: string;
        buildingId: string;
        companyId: string;
        companyIds: string[];
        storageApartmentId: string;
        readableId: string;
        id: string;
    }>;
    update(request: Request, user: RequestUser, apartmentId: string, payload: UpdateApartmentDto): Promise<{
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
        ownerActivated: boolean;
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
        skipped: number;
        errors: Array<{
            apartmentId: string;
            message: string;
        }>;
    }>;
}
