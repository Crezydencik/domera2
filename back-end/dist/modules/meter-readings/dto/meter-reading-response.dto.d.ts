export declare class MeterReadingItemDto {
    id: string;
    apartmentId: string;
    meterId: string;
    previousValue: number;
    currentValue: number;
    consumption: number;
    month: number;
    year: number;
    meterKey?: string;
}
export declare class MeterReadingListResponseDto {
    items: MeterReadingItemDto[];
}
export declare class MeterReadingCreateResponseDto {
    success: boolean;
    reading: MeterReadingItemDto;
}
