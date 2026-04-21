export declare class CreateMeterReadingDto {
    apartmentId: string;
    meterId: string;
    meterKey?: 'coldmeterwater' | 'hotmeterwater';
    previousValue: number;
    currentValue: number;
    consumption: number;
    buildingId: string;
    month?: number;
    year?: number;
}
