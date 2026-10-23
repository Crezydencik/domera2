type WaterMeterBaseKey = 'coldmeterwater' | 'hotmeterwater';
type ExtraMeterIndex = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/**
 * Группа счётчика в waterReadings квартиры.
 * Первый счётчик воды каждого вида — `coldmeterwater` / `hotmeterwater` (как раньше),
 * дополнительные — `coldmeterwater_2` … `coldmeterwater_9`. Электричество — всегда один `electricitymeter`.
 */
export type MeterReadingKey = WaterMeterBaseKey | `${WaterMeterBaseKey}_${ExtraMeterIndex}` | 'electricitymeter';

/** Базовые ключи (по одному счётчику каждого вида). */
export const METER_READING_KEYS: readonly MeterReadingKey[] = [
  'coldmeterwater',
  'hotmeterwater',
  'electricitymeter',
];

/** Сколько счётчиков одного вида воды может быть в квартире. */
export const MAX_WATER_METERS_PER_KIND = 9;

export const METER_READING_KEY_PATTERN = /^(?:(?:coldmeterwater|hotmeterwater)(?:_[2-9])?|electricitymeter)$/;

export function isMeterReadingKey(value: unknown): value is MeterReadingKey {
  return typeof value === 'string' && METER_READING_KEY_PATTERN.test(value);
}

/** Ключ n-го счётчика воды: 1 → `coldmeterwater`, 2 → `coldmeterwater_2`. */
export function waterMeterKey(base: WaterMeterBaseKey, index: number): MeterReadingKey {
  return (index <= 1 ? base : `${base}_${index}`) as MeterReadingKey;
}

const KEY_ORDER: Record<string, number> = { coldmeterwater: 0, hotmeterwater: 1, electricitymeter: 2 };

function keySortValue(key: string) {
  const [base, index] = key.split('_');
  return (KEY_ORDER[base] ?? 9) * 100 + Number(index ?? 1);
}

/** Все группы счётчиков, которые есть в waterReadings квартиры: базовые и дополнительные, по порядку. */
export function meterReadingKeysIn(waterReadings: Record<string, unknown> | null | undefined): MeterReadingKey[] {
  const keys = new Set<MeterReadingKey>(METER_READING_KEYS);
  for (const key of Object.keys(waterReadings ?? {})) {
    if (isMeterReadingKey(key)) keys.add(key);
  }
  return [...keys].sort((a, b) => keySortValue(a) - keySortValue(b));
}

/** К какому виду ресурса относится группа: вода или электричество. */
export function meterKeyUtility(key: string): 'water' | 'electricity' {
  return key === 'electricitymeter' ? 'electricity' : 'water';
}

export const METER_READING_PERIOD_TIME_ZONE = 'Europe/Riga';

export type BuildingInfo = {
  name?: string;
  address?: string;
};
