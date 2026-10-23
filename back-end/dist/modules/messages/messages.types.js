"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MESSAGE_LIMITS = exports.MESSAGE_CATEGORIES = void 0;
exports.MESSAGE_CATEGORIES = ['urgent', 'invoice', 'readings', 'documents', 'other'];
exports.MESSAGE_LIMITS = {
    subject: 200,
    body: 5000,
    files: 3,
    fileBytes: 10 * 1024 * 1024,
    list: 1000,
};
