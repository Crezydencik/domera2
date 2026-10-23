type WaterMeterBaseKey = 'coldmeterwater' | 'hotmeterwater';
type ExtraMeterIndex = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type MeterReadingKey = WaterMeterBaseKey | `${WaterMeterBaseKey}_${ExtraMeterIndex}` | 'electricitymeter';
export declare const METER_READING_KEYS: readonly MeterReadingKey[];
export declare const MAX_WATER_METERS_PER_KIND = 9;
export declare const METER_READING_KEY_PATTERN: RegExp;
export declare function isMeterReadingKey(value: unknown): value is MeterReadingKey;
export declare function waterMeterKey(base: WaterMeterBaseKey, index: number): MeterReadingKey;
export declare function meterReadingKeysIn(waterReadings: Record<string, unknown> | null | undefined): MeterReadingKey[];
export declare function meterKeyUtility(key: string): 'water' | 'electricity';
export declare const METER_READING_PERIOD_TIME_ZONE = "Europe/Riga";
export type BuildingInfo = {
    name?: string;
    address?: string;
};
export {};
