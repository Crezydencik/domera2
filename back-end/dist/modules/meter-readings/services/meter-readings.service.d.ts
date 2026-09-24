import { Request } from 'express';
import { RequestUser } from '../../../common/auth/request-user.type';
import { ElectricityPaymentService } from './electricity-payment.service';
import { MeterReadingCrudService } from './meter-reading-crud.service';
import { MeterReadingQueryService } from './meter-reading-query.service';
import { MeterReadingReminderService } from './meter-reading-reminder.service';
export declare class MeterReadingsService {
    private readonly queryService;
    private readonly crudService;
    private readonly electricityPaymentService;
    private readonly reminderService;
    constructor(queryService: MeterReadingQueryService, crudService: MeterReadingCrudService, electricityPaymentService: ElectricityPaymentService, reminderService: MeterReadingReminderService);
    list(user: RequestUser, apartmentId?: string, companyId?: string): Promise<{
        items: Record<string, unknown>[];
    }>;
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
    sendManualReminder(user: RequestUser, payload: Record<string, unknown>): Promise<{
        success: boolean;
        sent: number;
        failed: number;
        skippedNoEmail: number;
        skippedSubmitted: number;
        totalApartments: number;
    }>;
    resendMissingAutoReminder(user: RequestUser, payload: Record<string, unknown>): Promise<{
        success: boolean;
        sent: number;
        failed: number;
        skippedAlreadySent: number;
        skippedNoEmail: number;
        skippedSubmitted: number;
        totalApartments: number;
    }>;
}
