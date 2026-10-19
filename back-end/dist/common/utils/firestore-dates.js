"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.firestoreDateToIso = firestoreDateToIso;
exports.firestoreDateToMillis = firestoreDateToMillis;
function firestoreDateToIso(value) {
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (typeof value === 'string') {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? value : date.toISOString();
    }
    if (typeof value === 'number') {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }
    if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
        return value.toDate().toISOString();
    }
    return null;
}
function firestoreDateToMillis(value) {
    const iso = firestoreDateToIso(value);
    if (!iso)
        return 0;
    const millis = new Date(iso).getTime();
    return Number.isFinite(millis) ? millis : 0;
}
