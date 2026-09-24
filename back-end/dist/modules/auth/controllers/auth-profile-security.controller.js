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
exports.AuthProfileSecurityController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const current_user_decorator_1 = require("../../../common/auth/current-user.decorator");
const firebase_auth_guard_1 = require("../../../common/auth/firebase-auth.guard");
const auth_service_1 = require("../auth.service");
const change_email_dto_1 = require("../dto/change-email.dto");
const change_password_dto_1 = require("../dto/change-password.dto");
const confirm_email_change_dto_1 = require("../dto/confirm-email-change.dto");
const auth_cookie_service_1 = require("../services/auth-cookie.service");
const auth_exception_mapper_service_1 = require("../services/auth-exception-mapper.service");
let AuthProfileSecurityController = class AuthProfileSecurityController {
    constructor(authService, authCookieService, exceptionMapper) {
        this.authService = authService;
        this.authCookieService = authCookieService;
        this.exceptionMapper = exceptionMapper;
    }
    async changeEmail(request, user, dto) {
        try {
            const result = await this.authService.changeEmail(request, user, dto);
            return {
                success: true,
                userId: result.userId,
                email: result.email,
                pendingEmail: result.pendingEmail,
                verificationRequired: result.verificationRequired,
            };
        }
        catch (error) {
            this.exceptionMapper.mapServiceError(error);
        }
    }
    async confirmEmailChange(request, dto) {
        try {
            return await this.authService.confirmEmailChange(request, dto.token);
        }
        catch (error) {
            this.exceptionMapper.mapServiceError(error);
        }
    }
    async changePassword(request, user, dto, response) {
        try {
            const result = await this.authService.changePassword(request, user, dto);
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
};
exports.AuthProfileSecurityController = AuthProfileSecurityController;
__decorate([
    (0, common_1.Patch)('me/email'),
    (0, common_1.UseGuards)(firebase_auth_guard_1.FirebaseAuthGuard),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Change the authenticated user email' }),
    (0, swagger_1.ApiBody)({ type: change_email_dto_1.ChangeEmailDto }),
    (0, swagger_1.ApiCookieAuth)('__session'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, change_email_dto_1.ChangeEmailDto]),
    __metadata("design:returntype", Promise)
], AuthProfileSecurityController.prototype, "changeEmail", null);
__decorate([
    (0, common_1.Post)('me/email/confirm'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Confirm an email change using the verification link token' }),
    (0, swagger_1.ApiBody)({ type: confirm_email_change_dto_1.ConfirmEmailChangeDto }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, confirm_email_change_dto_1.ConfirmEmailChangeDto]),
    __metadata("design:returntype", Promise)
], AuthProfileSecurityController.prototype, "confirmEmailChange", null);
__decorate([
    (0, common_1.Patch)('me/password'),
    (0, common_1.UseGuards)(firebase_auth_guard_1.FirebaseAuthGuard),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Change the authenticated user password' }),
    (0, swagger_1.ApiBody)({ type: change_password_dto_1.ChangePasswordDto }),
    (0, swagger_1.ApiCookieAuth)('__session'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, change_password_dto_1.ChangePasswordDto, Object]),
    __metadata("design:returntype", Promise)
], AuthProfileSecurityController.prototype, "changePassword", null);
exports.AuthProfileSecurityController = AuthProfileSecurityController = __decorate([
    (0, swagger_1.ApiTags)('Auth'),
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [auth_service_1.AuthService,
        auth_cookie_service_1.AuthCookieService,
        auth_exception_mapper_service_1.AuthExceptionMapperService])
], AuthProfileSecurityController);
