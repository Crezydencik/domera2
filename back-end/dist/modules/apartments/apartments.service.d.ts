import { Request } from 'express';
import { RequestUser } from '../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../common/infrastructure/firebase/firebase-admin.service';
import { AuditLogService } from '../../common/services/audit-log.service';
import { RateLimitService } from '../../common/services/rate-limit.service';
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
    constructor(firebaseAdminService: FirebaseAdminService, rateLimitService: RateLimitService, auditLogService: AuditLogService);
    private enforceRateLimit;
    private normalizeHeader;
    private normalizeApartmentNumber;
    private getCellStringByHeader;
    private parseReadingPeriod;
    private parsePeriodFromDateCell;
    private extractReadings;
    private buildSubmittedAtFromPeriod;
    private findDueDateFromRow;
    private buildWaterReadingGroup;
    importFromSpreadsheet(input: ImportInput): Promise<{
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
        number: string;
        buildingId: string;
        companyIds: string[];
        createdAt: Date;
        updatedAt: Date;
        id: string;
    }>;
    update(request: Request, user: RequestUser, apartmentId: string, payload: Record<string, unknown>): Promise<{
        success: boolean;
    }>;
    remove(request: Request, user: RequestUser, apartmentId: string): Promise<{
        success: boolean;
    }>;
    unassignResident(request: Request, user: RequestUser, apartmentId: string): Promise<{
        success: boolean;
    }>;
    addOrInviteTenant(request: Request, user: RequestUser, apartmentId: string, emailInput: string): Promise<{
        success: boolean;
    }>;
    removeTenant(request: Request, user: RequestUser, apartmentId: string, userId: string): Promise<{
        success: boolean;
    }>;
}
export {};
