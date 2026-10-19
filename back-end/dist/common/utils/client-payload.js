"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALWAYS_PROTECTED_KEYS = void 0;
exports.sanitizeClientPayload = sanitizeClientPayload;
const common_1 = require("@nestjs/common");
const DEFAULT_MAX_BYTES = 64 * 1024;
const DEFAULT_MAX_DEPTH = 6;
exports.ALWAYS_PROTECTED_KEYS = ['id', 'createdAt', 'createdBy', 'createdByUid', 'updatedAt', 'deletedAt'];
function sanitizeClientPayload(payload, options = {}) {
    const source = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
    const blocked = new Set([...exports.ALWAYS_PROTECTED_KEYS, ...(options.protectedKeys ?? [])]);
    const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
    const depthOf = (value, depth) => {
        if (depth > maxDepth)
            return depth;
        if (Array.isArray(value))
            return Math.max(depth, ...value.map((item) => depthOf(item, depth + 1)));
        if (value && typeof value === 'object' && !(value instanceof Date)) {
            return Math.max(depth, ...Object.values(value).map((item) => depthOf(item, depth + 1)));
        }
        return depth;
    };
    const result = {};
    for (const [key, value] of Object.entries(source)) {
        if (blocked.has(key) || key.startsWith('__') || value === undefined)
            continue;
        result[key] = value;
    }
    if (depthOf(result, 0) > maxDepth)
        throw new common_1.BadRequestException('Payload is nested too deeply');
    const bytes = Buffer.byteLength(JSON.stringify(result), 'utf8');
    if (bytes > (options.maxBytes ?? DEFAULT_MAX_BYTES))
        throw new common_1.BadRequestException('Payload is too large');
    return result;
}
