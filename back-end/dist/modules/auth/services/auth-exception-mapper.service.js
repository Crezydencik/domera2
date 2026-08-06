"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var AuthExceptionMapperService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthExceptionMapperService = void 0;
const common_1 = require("@nestjs/common");
let AuthExceptionMapperService = AuthExceptionMapperService_1 = class AuthExceptionMapperService {
    constructor() {
        this.logger = new common_1.Logger(AuthExceptionMapperService_1.name);
    }
    mapServiceError(error) {
        if (error instanceof common_1.HttpException)
            throw error;
        const message = error instanceof Error ? error.message : 'Unexpected auth error';
        this.logger.error('Auth service error', error instanceof Error ? error.stack : String(error));
        const statusCode = error?.statusCode;
        const retryAfter = error?.retryAfter;
        if (statusCode === 429) {
            throw new common_1.HttpException({
                statusCode: 429,
                message,
                retryAfter,
            }, common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
        if (statusCode === 401)
            throw new common_1.HttpException({ statusCode: 401, message }, common_1.HttpStatus.UNAUTHORIZED);
        if (statusCode === 403)
            throw new common_1.HttpException({ statusCode: 403, message }, common_1.HttpStatus.FORBIDDEN);
        if (statusCode === 409)
            throw new common_1.HttpException({ statusCode: 409, message }, common_1.HttpStatus.CONFLICT);
        if (statusCode === 404)
            throw new common_1.HttpException({ statusCode: 404, message }, common_1.HttpStatus.NOT_FOUND);
        if (statusCode === 410)
            throw new common_1.HttpException({ statusCode: 410, message }, common_1.HttpStatus.GONE);
        if (statusCode === 400)
            throw new common_1.BadRequestException(message);
        throw new common_1.HttpException({ statusCode: 500, message }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
    }
};
exports.AuthExceptionMapperService = AuthExceptionMapperService;
exports.AuthExceptionMapperService = AuthExceptionMapperService = AuthExceptionMapperService_1 = __decorate([
    (0, common_1.Injectable)()
], AuthExceptionMapperService);
