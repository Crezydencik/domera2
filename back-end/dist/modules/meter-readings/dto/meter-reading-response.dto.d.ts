export declare class MeterReadingItemDto {
    id: string;
    apartmentId: string;
    apartmentNumber?: string;
    buildingId?: string;
    buildingName?: string;
    buildingAddress?: string;
    meterId: string;
    previousValue: number;
    currentValue: number;
    consumption: number;
    month: number;
    year: number;
    submittedAt?: string | Date;
    serialNumber?: string;
    meterKey?: string;
}
export declare class MeterReadingListResponseDto {
    items: MeterReadingItemDto[];
}
export declare class MeterReadingCreateResponseDto {
    success: boolean;
    reading: MeterReadingItemDto;
}
