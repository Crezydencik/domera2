export type MeterReadingKey = 'coldmeterwater' | 'hotmeterwater' | 'electricitymeter';
export declare const METER_READING_KEYS: readonly MeterReadingKey[];
export declare const METER_READING_PERIOD_TIME_ZONE = "Europe/Riga";
export type BuildingInfo = {
    name?: string;
    address?: string;
};
