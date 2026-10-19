"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.firstString = firstString;
exports.firstNonEmptyString = firstNonEmptyString;
exports.errorMessage = errorMessage;
function firstString(...values) {
    for (const value of values) {
        if (typeof value === 'string' && value.trim())
            return value.trim();
        if (typeof value === 'number' && Number.isFinite(value))
            return String(value);
    }
    return '';
}
function firstNonEmptyString(...values) {
    for (const value of values) {
        if (typeof value === 'string' && value.trim())
            return value.trim();
    }
    return '';
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
