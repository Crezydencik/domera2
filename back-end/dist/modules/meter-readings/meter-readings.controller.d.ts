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
    create(request: Request, user: RequestUser, body: CreateMeterReadingDto): Promise<{
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
