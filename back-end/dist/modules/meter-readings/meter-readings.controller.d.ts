import { Request } from 'express';
import { RequestUser } from '../../common/auth/request-user.type';
import { MeterReadingsService } from './meter-readings.service';
import { CreateMeterReadingDto } from './dto/create-meter-reading.dto';
import { UpdateMeterReadingDto } from './dto/update-meter-reading.dto';
export declare class MeterReadingsController {
    private readonly meterReadingsService;
    constructor(meterReadingsService: MeterReadingsService);
    list(user: RequestUser, apartmentId?: string, companyId?: string): Promise<{
        items: Record<string, unknown>[];
    }>;
    listElectricityPayments(user: RequestUser, buildingId?: string, apartmentId?: string): Promise<{
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
    createElectricityPayment(request: Request, user: RequestUser, body: Record<string, unknown>): Promise<{
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
    confirmElectricityPayment(request: Request, user: RequestUser, paymentId: string, body: Record<string, unknown>): Promise<{
        success: boolean;
    }>;
    removeElectricityPayment(request: Request, user: RequestUser, paymentId: string, apartmentId?: string): Promise<{
        success: boolean;
    }>;
    create(request: Request, user: RequestUser, body: CreateMeterReadingDto): Promise<{
        success: boolean;
        reading: Record<string, unknown> & {
            currentValue: number;
            previousValue: number;
            source?: string;
            meterReadingSource?: string;
        };
    }>;
    update(request: Request, user: RequestUser, readingId: string, body: UpdateMeterReadingDto): Promise<{
        success: boolean;
    }>;
    remove(request: Request, user: RequestUser, readingId: string, apartmentId?: string): Promise<{
        success: boolean;
    }>;
    sendTestReminder(user: RequestUser): Promise<{
        success: boolean;
        message: string;
    }>;
}
