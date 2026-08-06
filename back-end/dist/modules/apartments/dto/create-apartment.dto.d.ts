export declare class ApartmentReadingConfigOverrideDto {
    useBuildingDefaults: boolean;
    hotWaterMeters: number;
    coldWaterMeters: number;
}
export declare class CreateApartmentDto {
    number: string;
    buildingId: string;
    companyId: string;
    address?: string;
    floor?: number;
    area?: number;
    declaredResidents?: number;
    readingConfigOverride?: ApartmentReadingConfigOverrideDto;
}
export declare class UpdateApartmentDto {
    number?: string;
    buildingId?: string;
    companyId?: string;
    address?: string;
    floor?: number;
    area?: number;
    declaredResidents?: number;
    cadastralNumber?: string;
    cadastralPart?: string;
    commonPropertyShare?: string;
    apartmentType?: string;
    heatingArea?: number;
    managementArea?: number;
    readingConfigOverride?: ApartmentReadingConfigOverrideDto;
    waterReadings?: Record<string, unknown>;
}
