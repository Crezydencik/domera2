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
const current_user_decorator_1 = require("../../../common/auth/current-user.decorator");
const firebase_auth_guard_1 = require("../../../common/auth/firebase-auth.guard");
const role_constants_1 = require("../../../common/auth/role.constants");
const roles_decorator_1 = require("../../../common/auth/roles.decorator");
const roles_guard_1 = require("../../../common/auth/roles.guard");
const email_log_service_1 = require("../services/email-log.service");
const email_service_1 = require("../services/email.service");
const email_template_service_1 = require("../services/email-template.service");
const send_email_dto_1 = require("../dto/send-email.dto");
let EmailController = class EmailController {
    constructor(emailService, emailLogService, templateService) {
        this.emailService = emailService;
        this.emailLogService = emailLogService;
        this.templateService = templateService;
    }
    previewTemplate(type, language) {
        const normalizedLanguage = language === 'en' || language === 'ru' || language === 'lv' ? language : 'lv';
        const normalizedType = this.normalizePreviewType(type);
        const template = this.buildPreviewTemplate(normalizedType, normalizedLanguage);
        return {
            type: normalizedType,
            language: normalizedLanguage,
            subject: template.subject,
            html: template.html,
        };
    }
    async stats(user, type, companyId, buildingId, apartmentId) {
        const normalizedType = this.normalizeStatsType(type);
        const scopedCompanyId = (0, role_constants_1.isPlatformAdminRole)(user.role)
            ? this.cleanString(companyId)
            : this.cleanString(user.companyId);
        if (!(0, role_constants_1.isPlatformAdminRole)(user.role) && !scopedCompanyId) {
            throw new common_1.BadRequestException('Company ID not found for this user');
        }
        return this.emailLogService.getStats({
            type: normalizedType,
            companyId: scopedCompanyId,
            buildingId: this.cleanString(buildingId),
            apartmentId: this.cleanString(apartmentId),
        });
    }
    async deliveries(user, type, companyId, buildingId, apartmentId, deliveryKeyPrefix, limit) {
        const normalizedType = this.normalizeStatsType(type);
        const scopedCompanyId = (0, role_constants_1.isPlatformAdminRole)(user.role)
            ? this.cleanString(companyId)
            : this.cleanString(user.companyId);
        if (!(0, role_constants_1.isPlatformAdminRole)(user.role) && !scopedCompanyId) {
            throw new common_1.BadRequestException('Company ID not found for this user');
        }
        return this.emailLogService.getDeliveries({
            type: normalizedType,
            companyId: scopedCompanyId,
            buildingId: this.cleanString(buildingId),
            apartmentId: this.cleanString(apartmentId),
            deliveryKeyPrefix: this.cleanString(deliveryKeyPrefix),
            limit: this.cleanNumber(limit, 200),
        });
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
    normalizePreviewType(type) {
        const allowed = [
            'registrationCode',
            'passwordReset',
            'ownerInvitation',
            'tenantInvitation',
            'tenantInvitedByOwner',
            'invoiceGenerated',
            'meterReadingReminder',
            'meterReadingClosingReminder',
            'notification',
        ];
        return allowed.includes(type) ? type : 'meterReadingReminder';
    }
    normalizeStatsType(type) {
        const allowed = [
            'registrationCode',
            'passwordReset',
            'ownerInvitation',
            'tenantInvitation',
            'tenantInvitedByOwner',
            'invoiceGenerated',
            'meterReadingReminder',
            'notification',
        ];
        return allowed.includes(type) ? type : undefined;
    }
    cleanString(value) {
        const trimmed = typeof value === 'string' ? value.trim() : '';
        return trimmed || undefined;
    }
    cleanNumber(value, fallback) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
    }
    buildPreviewTemplate(type, language) {
        const sampleLink = 'https://domera.example/app';
        switch (type) {
            case 'registrationCode':
                return this.templateService.registrationCode({ to: 'resident@example.com', code: '482913', language });
            case 'passwordReset':
                return this.templateService.passwordReset({ to: 'resident@example.com', resetLink: sampleLink, language });
            case 'ownerInvitation':
                return this.templateService.ownerInvitation({
                    to: 'owner@example.com',
                    ownerName: 'Marta Ozola',
                    ownerEmail: 'owner@example.com',
                    companyName: 'Domera Management',
                    invitationLink: sampleLink,
                    buildingName: 'Brivibas 10',
                    apartmentNumber: '24',
                    language,
                });
            case 'tenantInvitation':
                return this.templateService.tenantInvitation({
                    to: 'tenant@example.com',
                    companyName: 'Domera Management',
                    invitationLink: sampleLink,
                    buildingName: 'Brivibas 10',
                    apartmentNumber: '24',
                    senderName: 'Marta Ozola',
                    language,
                });
            case 'tenantInvitedByOwner':
                return this.templateService.tenantInvitedByOwner({
                    to: 'tenant@example.com',
                    tenantName: 'Janis Berzins',
                    brandName: 'Domera Management',
                    ownerName: 'Marta Ozola',
                    invitationLink: sampleLink,
                    buildingName: 'Brivibas 10',
                    apartmentNumber: '24',
                    language,
                });
            case 'invoiceGenerated':
                return this.templateService.invoiceGenerated({
                    to: 'resident@example.com',
                    tenantName: 'Janis Berzins',
                    brandName: 'Domera Management',
                    apartmentNumber: '24',
                    buildingName: 'Brivibas 10',
                    invoiceNumber: 'INV-2026-0007',
                    amount: '128.45 EUR',
                    dueDate: '31.08.2026',
                    invoiceLink: sampleLink,
                    language,
                });
            case 'notification':
                return this.templateService.notification({
                    to: 'resident@example.com',
                    title: 'Domera notification',
                    message: 'A new document has been added for your apartment.',
                    actionLabel: 'Open Domera',
                    actionLink: sampleLink,
                    brandName: 'Domera',
                    footer: 'This is a preview message.',
                    language,
                });
            case 'meterReadingReminder':
                return this.templateService.meterReadingReminder({
                    to: 'resident@example.com',
                    tenantName: 'Janis Berzins',
                    brandName: 'Domera Management',
                    apartmentNumber: '24',
                    buildingName: 'Brivibas 10',
                    submissionLink: sampleLink,
                    periodLabel: '01.08.2026 - 31.08.2026',
                    deadline: '31.08.2026',
                    reminderStage: 'start',
                    language,
                });
            case 'meterReadingClosingReminder':
            default:
                return this.templateService.meterReadingReminder({
                    to: 'resident@example.com',
                    tenantName: 'Janis Berzins',
                    brandName: 'Domera Management',
                    apartmentNumber: '24',
                    buildingName: 'Brivibas 10',
                    submissionLink: sampleLink,
                    periodLabel: '01.08.2026 - 31.08.2026',
                    deadline: '31.08.2026',
                    reminderStage: 'close',
                    daysUntilDeadline: 0,
                    language,
                });
        }
    }
};
exports.EmailController = EmailController;
__decorate([
    (0, common_1.Get)('templates/preview'),
    (0, roles_decorator_1.Roles)('PlatformAdmin', 'ManagementCompany', 'Accountant', 'Resident', 'Landlord'),
    (0, swagger_1.ApiOperation)({ summary: 'Preview an email template without sending it' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Email template preview returned successfully' }),
    __param(0, (0, common_1.Query)('type')),
    __param(1, (0, common_1.Query)('language')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], EmailController.prototype, "previewTemplate", null);
__decorate([
    (0, common_1.Get)('stats'),
    (0, roles_decorator_1.Roles)('PlatformAdmin', 'ManagementCompany', 'Accountant'),
    (0, swagger_1.ApiOperation)({ summary: 'Get email delivery statistics' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Email statistics returned successfully' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('type')),
    __param(2, (0, common_1.Query)('companyId')),
    __param(3, (0, common_1.Query)('buildingId')),
    __param(4, (0, common_1.Query)('apartmentId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, String]),
    __metadata("design:returntype", Promise)
], EmailController.prototype, "stats", null);
__decorate([
    (0, common_1.Get)('deliveries'),
    (0, roles_decorator_1.Roles)('PlatformAdmin', 'ManagementCompany', 'Accountant'),
    (0, swagger_1.ApiOperation)({ summary: 'Get email delivery log items' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Email delivery log returned successfully' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('type')),
    __param(2, (0, common_1.Query)('companyId')),
    __param(3, (0, common_1.Query)('buildingId')),
    __param(4, (0, common_1.Query)('apartmentId')),
    __param(5, (0, common_1.Query)('deliveryKeyPrefix')),
    __param(6, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], EmailController.prototype, "deliveries", null);
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
    (0, common_1.Controller)('emails'),
    (0, common_1.UseGuards)(firebase_auth_guard_1.FirebaseAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('ManagementCompany', 'Accountant'),
    __metadata("design:paramtypes", [email_service_1.EmailService,
        email_log_service_1.EmailLogService,
        email_template_service_1.EmailTemplateService])
], EmailController);
