"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.METER_READING_PERIOD_TIME_ZONE = exports.METER_READING_KEY_PATTERN = exports.MAX_WATER_METERS_PER_KIND = exports.METER_READING_KEYS = void 0;
exports.isMeterReadingKey = isMeterReadingKey;
exports.waterMeterKey = waterMeterKey;
exports.meterReadingKeysIn = meterReadingKeysIn;
exports.meterKeyUtility = meterKeyUtility;
exports.METER_READING_KEYS = [
    'coldmeterwater',
    'hotmeterwater',
    'electricitymeter',
];
exports.MAX_WATER_METERS_PER_KIND = 9;
exports.METER_READING_KEY_PATTERN = /^(?:(?:coldmeterwater|hotmeterwater)(?:_[2-9])?|electricitymeter)$/;
function isMeterReadingKey(value) {
    return typeof value === 'string' && exports.METER_READING_KEY_PATTERN.test(value);
}
function waterMeterKey(base, index) {
    return (index <= 1 ? base : `${base}_${index}`);
}
const KEY_ORDER = { coldmeterwater: 0, hotmeterwater: 1, electricitymeter: 2 };
function keySortValue(key) {
    const [base, index] = key.split('_');
    return (KEY_ORDER[base] ?? 9) * 100 + Number(index ?? 1);
}
function meterReadingKeysIn(waterReadings) {
    const keys = new Set(exports.METER_READING_KEYS);
    for (const key of Object.keys(waterReadings ?? {})) {
        if (isMeterReadingKey(key))
            keys.add(key);
    }
    return [...keys].sort((a, b) => keySortValue(a) - keySortValue(b));
}
function meterKeyUtility(key) {
    return key === 'electricitymeter' ? 'electricity' : 'water';
}
exports.METER_READING_PERIOD_TIME_ZONE = 'Europe/Riga';
