import { ReadingConfigOverride } from '../types/apartment.types';
export declare class ApartmentMeterService {
    normalizeReadingConfigOverride(payload: {
        readingConfigOverride?: unknown;
    }): ReadingConfigOverride | undefined;
    buildEmptyWaterReadings(apartmentId: string, buildingId: string, building: Record<string, unknown>, readingConfigOverride?: ReadingConfigOverride): Record<string, unknown>;
    sanitizeWaterReadingPatch(value: unknown): Record<string, unknown> | undefined;
}
