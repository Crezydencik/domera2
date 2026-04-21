"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildMeterHistorySnapshot = void 0;
const toNumberOrNull = (value) => {
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};
const toDateValue = (value) => {
    if (value instanceof Date && !Number.isNaN(value.getTime()))
        return value;
    if (typeof value === 'string') {
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
};
const buildMeterHistorySnapshot = (history) => {
    const sorted = [...history].sort((a, b) => {
        const yearA = toNumberOrNull(a.year) ?? 0;
        const yearB = toNumberOrNull(b.year) ?? 0;
        if (yearA !== yearB)
            return yearA - yearB;
        const monthA = toNumberOrNull(a.month) ?? 0;
        const monthB = toNumberOrNull(b.month) ?? 0;
        if (monthA !== monthB)
            return monthA - monthB;
        const dateA = toDateValue(a.submittedAt)?.getTime() ?? 0;
        const dateB = toDateValue(b.submittedAt)?.getTime() ?? 0;
        return dateA - dateB;
    });
    let prevCurrentValue = null;
    const normalized = sorted.map((item) => {
        const currentValue = toNumberOrNull(item.currentValue);
        const previousValue = prevCurrentValue;
        const consumption = previousValue != null && currentValue != null
            ? Math.max(0, currentValue - previousValue)
            : toNumberOrNull(item.consumption);
        if (currentValue != null) {
            prevCurrentValue = currentValue;
        }
        return {
            ...item,
            previousValue,
            consumption,
        };
    });
    return {
        history: normalized,
        latestReading: normalized.length > 0 ? normalized[normalized.length - 1] : null,
    };
};
exports.buildMeterHistorySnapshot = buildMeterHistorySnapshot;
