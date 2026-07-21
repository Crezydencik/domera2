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
    private requireStaffCompanyId;
    private assertStaffApartmentCompanyAccess;
    private hasApartmentAccess;
    private historySubmittedAtTime;
    private electricityAllowsMultipleMonthlySubmissions;
    private hasInvoiceLinkedElectricityReadings;
    private extractApartmentReadings;
    private getAccessibleApartmentIds;
    list(user: RequestUser, apartmentId?: string, companyId?: string): Promise<{
        items: Record<string, unknown>[];
    }>;
    private electricityPaymentFromDoc;
    listElectricityPayments(user: RequestUser, query: {
        buildingId?: string;
        apartmentId?: string;
    }): Promise<{
        items: {
            id: string;
            apartmentId: string;
            amount: number;
            paidKwh: number;
            paidAt: string;
            note: string;
            confirmed: boolean;
            confirmedBy: string;
            createdAt: unknown;
        }[];
    }>;
    createElectricityPayment(request: Request, user: RequestUser, payload: Record<string, unknown>): Promise<{
        success: boolean;
        payment: {
            paidAt: string;
            id: string;
            apartmentId: string;
            amount: number;
            paidKwh: number;
            note: string;
            confirmed: boolean;
            confirmedBy: string;
            companyId: string;
            createdAt: Date;
        };
    }>;
    confirmElectricityPayment(request: Request, user: RequestUser, paymentId: string, payload: Record<string, unknown>): Promise<{
        success: boolean;
    }>;
    removeElectricityPayment(request: Request, user: RequestUser, paymentId: string, apartmentId: string): Promise<{
        success: boolean;
    }>;
    private loadBuildingInfo;
    private loadBuildings;
    create(request: Request, user: RequestUser, payload: Record<string, unknown>): Promise<{
        success: boolean;
        reading: Record<string, unknown> & {
            currentValue: number;
            previousValue: number;
            source?: string;
            meterReadingSource?: string;
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
