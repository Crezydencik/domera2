import { MeterReadingKey } from '../types/meter-reading.types';
export declare class CreateMeterReadingDto {
    apartmentId: string;
    meterId: string;
    meterKey?: MeterReadingKey;
    meterDigits?: number;
    previousValue: number;
    currentValue: number;
    consumption: number;
    buildingId: string;
    month?: number;
    year?: number;
    source?: string;
    meterReadingSource?: string;
    linkedInvoiceId?: string;
    linkedInvoiceExternalId?: string;
    allowMultipleMonthly?: boolean;
}
