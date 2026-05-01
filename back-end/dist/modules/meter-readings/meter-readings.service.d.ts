import { Request } from 'express';
import { FirebaseAdminService } from '../../common/infrastructure/firebase/firebase-admin.service';
import { RequestUser } from '../../common/auth/request-user.type';
import { AuditLogService } from '../../common/services/audit-log.service';
import { RateLimitService } from '../../common/services/rate-limit.service';
import { EmailService } from '../emails/email.service';
export declare class MeterReadingsService {
    private readonly firebaseAdminService;
    private readonly rateLimitService;
    private readonly auditLogService;
    private readonly emailService;
    constructor(firebaseAdminService: FirebaseAdminService, rateLimitService: RateLimitService, auditLogService: AuditLogService, emailService: EmailService);
    private assertAuthenticated;
    private hasApartmentAccess;
    private extractApartmentReadings;
    list(user: RequestUser, apartmentId?: string, companyId?: string): Promise<{
        items: Record<string, unknown>[];
    }>;
    private loadBuildingInfo;
    private loadBuildings;
    create(request: Request, user: RequestUser, payload: Record<string, unknown>): Promise<{
        success: boolean;
        reading: {
            id: `${string}-${string}-${string}-${string}-${string}`;
            apartmentId: string;
            meterId: string;
            submittedAt: Date;
            previousValue: number;
            currentValue: number;
            consumption: number;
            buildingId: string;
            month: number;
            year: number;
        };
    }>;
    update(request: Request, user: RequestUser, readingId: string, apartmentId: string, payload: Record<string, unknown>): Promise<{
        success: boolean;
    }>;
    remove(request: Request, user: RequestUser, readingId: string, apartmentId: string): Promise<{
        success: boolean;
    }>;
    sendTestReminder(user: RequestUser): Promise<{
        success: boolean;
        message: string;
    }>;
}
