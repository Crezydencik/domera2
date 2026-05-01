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
exports.EmailController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const email_service_1 = require("./email.service");
const send_email_dto_1 = require("./dto/send-email.dto");
let EmailController = class EmailController {
    constructor(emailService) {
        this.emailService = emailService;
    }
    async sendRegistrationCode(dto) {
        return this.emailService.sendRegistrationCode(dto);
    }
    async sendPasswordReset(dto) {
        return this.emailService.sendPasswordReset(dto);
    }
    async sendOwnerInvitation(dto) {
        return this.emailService.sendOwnerInvitation(dto);
    }
    async sendTenantInvitation(dto) {
        return this.emailService.sendTenantInvitation(dto);
    }
    async sendTenantInvitedByOwner(dto) {
        return this.emailService.sendTenantInvitedByOwner(dto);
    }
    async sendInvoiceGenerated(dto) {
        return this.emailService.sendInvoiceGenerated(dto);
    }
    async sendMeterReadingReminder(dto) {
        return this.emailService.sendMeterReadingReminder(dto);
    }
    async sendNotification(dto) {
        return this.emailService.sendNotification(dto);
    }
};
exports.EmailController = EmailController;
__decorate([
    (0, common_1.Post)('registration-code'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: 'Send registration code email' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Email sent successfully' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [send_email_dto_1.SendRegistrationCodeEmailDto]),
    __metadata("design:returntype", Promise)
], EmailController.prototype, "sendRegistrationCode", null);
__decorate([
    (0, common_1.Post)('password-reset'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: 'Send password reset email' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Email sent successfully' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [send_email_dto_1.SendPasswordResetEmailDto]),
    __metadata("design:returntype", Promise)
], EmailController.prototype, "sendPasswordReset", null);
__decorate([
    (0, common_1.Post)('owner-invitation'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: 'Send owner invitation email' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Email sent successfully' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [send_email_dto_1.SendOwnerInvitationEmailDto]),
    __metadata("design:returntype", Promise)
], EmailController.prototype, "sendOwnerInvitation", null);
__decorate([
    (0, common_1.Post)('tenant-invitation'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: 'Send tenant invitation email' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Email sent successfully' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [send_email_dto_1.SendTenantInvitationEmailDto]),
    __metadata("design:returntype", Promise)
], EmailController.prototype, "sendTenantInvitation", null);
__decorate([
    (0, common_1.Post)('tenant-invited-by-owner'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: 'Send email when owner invites tenant' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Email sent successfully' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [send_email_dto_1.SendTenantInvitedByOwnerEmailDto]),
    __metadata("design:returntype", Promise)
], EmailController.prototype, "sendTenantInvitedByOwner", null);
__decorate([
    (0, common_1.Post)('invoice-generated'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: 'Send invoice generated email' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Email sent successfully' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [send_email_dto_1.SendInvoiceGeneratedEmailDto]),
    __metadata("design:returntype", Promise)
], EmailController.prototype, "sendInvoiceGenerated", null);
__decorate([
    (0, common_1.Post)('meter-reading-reminder'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: 'Send meter reading reminder email' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Email sent successfully' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [send_email_dto_1.SendMeterReadingReminderEmailDto]),
    __metadata("design:returntype", Promise)
], EmailController.prototype, "sendMeterReadingReminder", null);
__decorate([
    (0, common_1.Post)('notification'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: 'Send generic notification email' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Email sent successfully' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [send_email_dto_1.SendNotificationEmailDto]),
    __metadata("design:returntype", Promise)
], EmailController.prototype, "sendNotification", null);
exports.EmailController = EmailController = __decorate([
    (0, swagger_1.ApiTags)('emails'),
    (0, common_1.Controller)('api/emails'),
    __metadata("design:paramtypes", [email_service_1.EmailService])
], EmailController);
