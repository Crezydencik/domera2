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
exports.AuthLoginRegistrationController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const auth_extra_response_dto_1 = require("../dto/auth-extra-response.dto");
const auth_service_1 = require("../auth.service");
const login_dto_1 = require("../dto/login.dto");
const register_dto_1 = require("../dto/register.dto");
const register_email_code_request_dto_1 = require("../dto/register-email-code-request.dto");
const register_email_code_verify_dto_1 = require("../dto/register-email-code-verify.dto");
const auth_cookie_service_1 = require("../services/auth-cookie.service");
const auth_exception_mapper_service_1 = require("../services/auth-exception-mapper.service");
let AuthLoginRegistrationController = class AuthLoginRegistrationController {
    constructor(authService, authCookieService, exceptionMapper) {
        this.authService = authService;
        this.authCookieService = authCookieService;
        this.exceptionMapper = exceptionMapper;
    }
    async login(request, dto, response) {
        try {
            const result = await this.authService.loginWithEmailPassword(request, dto);
            this.authCookieService.applySessionCookies(response, result.session);
            return {
                success: true,
                userId: result.userId,
                email: result.email,
                role: result.session.role,
                accountType: result.session.accountType,
                companyId: result.session.companyId,
                apartmentId: result.session.apartmentId,
            };
        }
        catch (error) {
            this.exceptionMapper.mapServiceError(error);
        }
    }
    async register(request, dto, response) {
        try {
            const result = await this.authService.registerWithEmailPassword(request, dto);
            this.authCookieService.applySessionCookies(response, result.session);
            return {
                success: true,
                userId: result.userId,
                email: result.email,
                role: result.session.role,
                accountType: result.session.accountType,
                companyId: result.session.companyId,
                apartmentId: result.session.apartmentId,
            };
        }
        catch (error) {
            this.exceptionMapper.mapServiceError(error);
        }
    }
    async requestRegisterEmailCode(request, dto, response) {
        try {
            return await this.authService.requestRegisterEmailCode(request, dto);
        }
        catch (error) {
            const retryAfter = error?.retryAfter;
            if (retryAfter) {
                response.setHeader('Retry-After', String(retryAfter));
            }
            this.exceptionMapper.mapServiceError(error);
        }
    }
    async verifyRegisterEmailCode(request, dto, response) {
        try {
            return await this.authService.verifyRegisterEmailCode(request, dto);
        }
        catch (error) {
            const retryAfter = error?.retryAfter;
            if (retryAfter) {
                response.setHeader('Retry-After', String(retryAfter));
            }
            this.exceptionMapper.mapServiceError(error);
        }
    }
};
exports.AuthLoginRegistrationController = AuthLoginRegistrationController;
__decorate([
    (0, common_1.Post)('login'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Sign in using email and password through the backend Firebase bridge' }),
    (0, swagger_1.ApiBody)({ type: login_dto_1.LoginDto }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, login_dto_1.LoginDto, Object]),
    __metadata("design:returntype", Promise)
], AuthLoginRegistrationController.prototype, "login", null);
__decorate([
    (0, common_1.Post)('register'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, swagger_1.ApiOperation)({ summary: 'Register a new Firebase user and create the profile through the backend' }),
    (0, swagger_1.ApiBody)({ type: register_dto_1.RegisterDto }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, register_dto_1.RegisterDto, Object]),
    __metadata("design:returntype", Promise)
], AuthLoginRegistrationController.prototype, "register", null);
__decorate([
    (0, common_1.Post)('register-email-code/request'),
    (0, swagger_1.ApiOperation)({ summary: 'Send registration email verification code' }),
    (0, swagger_1.ApiBody)({ type: register_email_code_request_dto_1.RegisterEmailCodeRequestDto }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Verification code sent successfully.',
        type: auth_extra_response_dto_1.RegisterEmailCodeRequestResponseDto,
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, register_email_code_request_dto_1.RegisterEmailCodeRequestDto, Object]),
    __metadata("design:returntype", Promise)
], AuthLoginRegistrationController.prototype, "requestRegisterEmailCode", null);
__decorate([
    (0, common_1.Post)('register-email-code/verify'),
    (0, swagger_1.ApiOperation)({ summary: 'Verify registration email code' }),
    (0, swagger_1.ApiBody)({ type: register_email_code_verify_dto_1.RegisterEmailCodeVerifyDto }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Verification code accepted.',
        type: auth_extra_response_dto_1.RegisterEmailCodeVerifyResponseDto,
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, register_email_code_verify_dto_1.RegisterEmailCodeVerifyDto, Object]),
    __metadata("design:returntype", Promise)
], AuthLoginRegistrationController.prototype, "verifyRegisterEmailCode", null);
exports.AuthLoginRegistrationController = AuthLoginRegistrationController = __decorate([
    (0, swagger_1.ApiTags)('Auth'),
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [auth_service_1.AuthService,
        auth_cookie_service_1.AuthCookieService,
        auth_exception_mapper_service_1.AuthExceptionMapperService])
], AuthLoginRegistrationController);
