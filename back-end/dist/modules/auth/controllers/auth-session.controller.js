"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthSessionController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const success_response_dto_1 = require("../../../common/dto/success-response.dto");
const auth_service_1 = require("../auth.service");
const set_session_dto_1 = require("../dto/set-session.dto");
const auth_cookie_service_1 = require("../services/auth-cookie.service");
let AuthSessionController = class AuthSessionController {
    constructor(authService, authCookieService) {
        this.authService = authService;
        this.authCookieService = authCookieService;
    }
    async setCookies(dto, response) {
        const session = await this.authService.createSessionCookie(dto);
        this.authCookieService.applySessionCookies(response, session);
        return {
            success: true,
            userId: session.userId,
            email: session.email,
            role: session.role,
            accountType: session.accountType,
            companyId: session.companyId,
            apartmentId: session.apartmentId,
        };
    }
    createSession(dto, response) {
        return this.setCookies(dto, response);
    }
    clearCookies(response) {
        this.authCookieService.clearAuthCookies(response);
        return { success: true };
    }
    clearSession(response) {
        return this.clearCookies(response);
    }
};
exports.AuthSessionController = AuthSessionController;
__decorate([
    (0, common_1.Post)('set-cookies'),
    (0, swagger_1.ApiOperation)({ summary: 'Create secure Firebase session cookie from ID token' }),
    (0, swagger_1.ApiBody)({ type: set_session_dto_1.SetSessionDto }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Session cookie created successfully.',
        type: success_response_dto_1.SuccessResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [set_session_dto_1.SetSessionDto, Object]),
    __metadata("design:returntype", Promise)
], AuthSessionController.prototype, "setCookies", null);
__decorate([
    (0, common_1.Post)('session'),
    (0, swagger_1.ApiOperation)({ summary: 'Create session cookie using architecture-aligned endpoint' }),
    (0, swagger_1.ApiBody)({ type: set_session_dto_1.SetSessionDto }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Session created successfully.',
        type: success_response_dto_1.SuccessResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [set_session_dto_1.SetSessionDto, Object]),
    __metadata("design:returntype", void 0)
], AuthSessionController.prototype, "createSession", null);
__decorate([
    (0, common_1.Post)('clear-cookies'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Clear auth and session cookies' }),
    (0, swagger_1.ApiCookieAuth)('__session'),
    (0, swagger_1.ApiOkResponse)({
        description: 'Cookies cleared successfully.',
        type: success_response_dto_1.SuccessResponseDto,
    }),
    __param(0, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthSessionController.prototype, "clearCookies", null);
__decorate([
    (0, common_1.Delete)('session'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Clear session using architecture-aligned endpoint' }),
    (0, swagger_1.ApiCookieAuth)('__session'),
    (0, swagger_1.ApiOkResponse)({
        description: 'Session cleared successfully.',
        type: success_response_dto_1.SuccessResponseDto,
    }),
    __param(0, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthSessionController.prototype, "clearSession", null);
exports.AuthSessionController = AuthSessionController = __decorate([
    (0, swagger_1.ApiTags)('Auth'),
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [auth_service_1.AuthService,
        auth_cookie_service_1.AuthCookieService])
], AuthSessionController);
