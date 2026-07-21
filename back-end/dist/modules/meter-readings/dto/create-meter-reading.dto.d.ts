export declare class CreateMeterReadingDto {
    apartmentId: string;
    meterId: string;
    meterKey?: 'coldmeterwater' | 'hotmeterwater' | 'electricitymeter';
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
