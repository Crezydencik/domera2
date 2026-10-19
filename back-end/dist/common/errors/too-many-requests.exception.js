"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TooManyRequestsException = void 0;
const common_1 = require("@nestjs/common");
class TooManyRequestsException extends common_1.HttpException {
    constructor(resetAt, message = 'Too many requests') {
        const retryAfter = typeof resetAt === 'number' ? Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)) : undefined;
        super({
            statusCode: common_1.HttpStatus.TOO_MANY_REQUESTS,
            message,
            ...(retryAfter !== undefined ? { retryAfter } : {}),
        }, common_1.HttpStatus.TOO_MANY_REQUESTS);
    }
}
exports.TooManyRequestsException = TooManyRequestsException;
