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
exports.AuthPasswordResetController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const auth_extra_response_dto_1 = require("../dto/auth-extra-response.dto");
const confirm_password_reset_dto_1 = require("../dto/confirm-password-reset.dto");
const preview_password_reset_dto_1 = require("../dto/preview-password-reset.dto");
const send_password_reset_dto_1 = require("../dto/send-password-reset.dto");
const auth_exception_mapper_service_1 = require("../services/auth-exception-mapper.service");
const auth_password_reset_service_1 = require("../services/auth-password-reset.service");
let AuthPasswordResetController = class AuthPasswordResetController {
    constructor(passwordResetService, exceptionMapper) {
        this.passwordResetService = passwordResetService;
        this.exceptionMapper = exceptionMapper;
    }
    async sendPasswordReset(request, dto, response) {
        try {
            return await this.passwordResetService.sendPasswordReset(request, dto);
        }
        catch (error) {
            const retryAfter = error?.retryAfter;
            if (retryAfter) {
                response.setHeader('Retry-After', String(retryAfter));
            }
            this.exceptionMapper.mapServiceError(error);
        }
    }
    async previewPasswordReset(request, dto) {
        try {
            return await this.passwordResetService.previewPasswordReset(request, dto.oobCode);
        }
        catch (error) {
            this.exceptionMapper.mapServiceError(error);
        }
    }
    async confirmPasswordReset(request, dto) {
        try {
            return await this.passwordResetService.confirmPasswordReset(request, dto);
        }
        catch (error) {
            this.exceptionMapper.mapServiceError(error);
        }
    }
};
exports.AuthPasswordResetController = AuthPasswordResetController;
__decorate([
    (0, common_1.Post)('send-password-reset'),
    (0, swagger_1.ApiOperation)({ summary: 'Send password reset email' }),
    (0, swagger_1.ApiBody)({ type: send_password_reset_dto_1.SendPasswordResetDto }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Password reset email sent.',
        type: auth_extra_response_dto_1.SendPasswordResetResponseDto,
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, send_password_reset_dto_1.SendPasswordResetDto, Object]),
    __metadata("design:returntype", Promise)
], AuthPasswordResetController.prototype, "sendPasswordReset", null);
__decorate([
    (0, common_1.Post)('preview-password-reset'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Preview the password reset target email through the backend' }),
    (0, swagger_1.ApiBody)({ type: preview_password_reset_dto_1.PreviewPasswordResetDto }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, preview_password_reset_dto_1.PreviewPasswordResetDto]),
    __metadata("design:returntype", Promise)
], AuthPasswordResetController.prototype, "previewPasswordReset", null);
__decorate([
    (0, common_1.Post)('confirm-password-reset'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Confirm Firebase password reset through the backend' }),
    (0, swagger_1.ApiBody)({ type: confirm_password_reset_dto_1.ConfirmPasswordResetDto }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, confirm_password_reset_dto_1.ConfirmPasswordResetDto]),
    __metadata("design:returntype", Promise)
], AuthPasswordResetController.prototype, "confirmPasswordReset", null);
exports.AuthPasswordResetController = AuthPasswordResetController = __decorate([
    (0, swagger_1.ApiTags)('Auth'),
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [auth_password_reset_service_1.AuthPasswordResetService,
        auth_exception_mapper_service_1.AuthExceptionMapperService])
], AuthPasswordResetController);
