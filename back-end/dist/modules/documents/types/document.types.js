"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALLOWED_MIME_TYPES = exports.MAX_DOCUMENT_BYTES = exports.DOCUMENT_SCOPES = void 0;
exports.DOCUMENT_SCOPES = new Set([
    'buildingResidents',
    'apartmentResidents',
    'apartmentPrivate',
    'privateApartment',
    'platformPrivate',
    'managementArchive',
]);
exports.MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
exports.ALLOWED_MIME_TYPES = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
]);
