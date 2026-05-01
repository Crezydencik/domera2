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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SendNotificationEmailDto = exports.SendMeterReadingReminderEmailDto = exports.SendInvoiceGeneratedEmailDto = exports.SendTenantInvitedByOwnerEmailDto = exports.SendTenantInvitationEmailDto = exports.SendOwnerInvitationEmailDto = exports.SendPasswordResetEmailDto = exports.SendRegistrationCodeEmailDto = exports.SendEmailDto = void 0;
const class_validator_1 = require("class-validator");
class SendEmailDto {
}
exports.SendEmailDto = SendEmailDto;
__decorate([
    (0, class_validator_1.IsEmail)(),
    __metadata("design:type", String)
], SendEmailDto.prototype, "to", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendEmailDto.prototype, "subject", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendEmailDto.prototype, "html", void 0);
class SendRegistrationCodeEmailDto {
}
exports.SendRegistrationCodeEmailDto = SendRegistrationCodeEmailDto;
__decorate([
    (0, class_validator_1.IsEmail)(),
    __metadata("design:type", String)
], SendRegistrationCodeEmailDto.prototype, "to", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendRegistrationCodeEmailDto.prototype, "code", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['en', 'ru', 'lv']),
    __metadata("design:type", String)
], SendRegistrationCodeEmailDto.prototype, "language", void 0);
class SendPasswordResetEmailDto {
}
exports.SendPasswordResetEmailDto = SendPasswordResetEmailDto;
__decorate([
    (0, class_validator_1.IsEmail)(),
    __metadata("design:type", String)
], SendPasswordResetEmailDto.prototype, "to", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendPasswordResetEmailDto.prototype, "resetLink", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['en', 'ru', 'lv']),
    __metadata("design:type", String)
], SendPasswordResetEmailDto.prototype, "language", void 0);
class SendOwnerInvitationEmailDto {
}
exports.SendOwnerInvitationEmailDto = SendOwnerInvitationEmailDto;
__decorate([
    (0, class_validator_1.IsEmail)(),
    __metadata("design:type", String)
], SendOwnerInvitationEmailDto.prototype, "to", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendOwnerInvitationEmailDto.prototype, "companyName", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendOwnerInvitationEmailDto.prototype, "invitationLink", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendOwnerInvitationEmailDto.prototype, "senderName", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['en', 'ru', 'lv']),
    __metadata("design:type", String)
], SendOwnerInvitationEmailDto.prototype, "language", void 0);
class SendTenantInvitationEmailDto {
}
exports.SendTenantInvitationEmailDto = SendTenantInvitationEmailDto;
__decorate([
    (0, class_validator_1.IsEmail)(),
    __metadata("design:type", String)
], SendTenantInvitationEmailDto.prototype, "to", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendTenantInvitationEmailDto.prototype, "companyName", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendTenantInvitationEmailDto.prototype, "invitationLink", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendTenantInvitationEmailDto.prototype, "buildingName", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendTenantInvitationEmailDto.prototype, "apartmentNumber", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendTenantInvitationEmailDto.prototype, "senderName", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['en', 'ru', 'lv']),
    __metadata("design:type", String)
], SendTenantInvitationEmailDto.prototype, "language", void 0);
class SendTenantInvitedByOwnerEmailDto {
}
exports.SendTenantInvitedByOwnerEmailDto = SendTenantInvitedByOwnerEmailDto;
__decorate([
    (0, class_validator_1.IsEmail)(),
    __metadata("design:type", String)
], SendTenantInvitedByOwnerEmailDto.prototype, "to", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendTenantInvitedByOwnerEmailDto.prototype, "ownerName", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendTenantInvitedByOwnerEmailDto.prototype, "invitationLink", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendTenantInvitedByOwnerEmailDto.prototype, "tenantName", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendTenantInvitedByOwnerEmailDto.prototype, "buildingName", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendTenantInvitedByOwnerEmailDto.prototype, "apartmentNumber", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['en', 'ru', 'lv']),
    __metadata("design:type", String)
], SendTenantInvitedByOwnerEmailDto.prototype, "language", void 0);
class SendInvoiceGeneratedEmailDto {
}
exports.SendInvoiceGeneratedEmailDto = SendInvoiceGeneratedEmailDto;
__decorate([
    (0, class_validator_1.IsEmail)(),
    __metadata("design:type", String)
], SendInvoiceGeneratedEmailDto.prototype, "to", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendInvoiceGeneratedEmailDto.prototype, "invoiceNumber", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendInvoiceGeneratedEmailDto.prototype, "amount", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendInvoiceGeneratedEmailDto.prototype, "dueDate", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendInvoiceGeneratedEmailDto.prototype, "invoiceLink", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendInvoiceGeneratedEmailDto.prototype, "tenantName", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendInvoiceGeneratedEmailDto.prototype, "apartmentNumber", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendInvoiceGeneratedEmailDto.prototype, "buildingName", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['en', 'ru', 'lv']),
    __metadata("design:type", String)
], SendInvoiceGeneratedEmailDto.prototype, "language", void 0);
class SendMeterReadingReminderEmailDto {
}
exports.SendMeterReadingReminderEmailDto = SendMeterReadingReminderEmailDto;
__decorate([
    (0, class_validator_1.IsEmail)(),
    __metadata("design:type", String)
], SendMeterReadingReminderEmailDto.prototype, "to", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendMeterReadingReminderEmailDto.prototype, "submissionLink", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendMeterReadingReminderEmailDto.prototype, "tenantName", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendMeterReadingReminderEmailDto.prototype, "apartmentNumber", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendMeterReadingReminderEmailDto.prototype, "buildingName", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], SendMeterReadingReminderEmailDto.prototype, "meters", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendMeterReadingReminderEmailDto.prototype, "deadline", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['en', 'ru', 'lv']),
    __metadata("design:type", String)
], SendMeterReadingReminderEmailDto.prototype, "language", void 0);
class SendNotificationEmailDto {
}
exports.SendNotificationEmailDto = SendNotificationEmailDto;
__decorate([
    (0, class_validator_1.IsEmail)(),
    __metadata("design:type", String)
], SendNotificationEmailDto.prototype, "to", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendNotificationEmailDto.prototype, "title", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendNotificationEmailDto.prototype, "message", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendNotificationEmailDto.prototype, "actionLabel", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendNotificationEmailDto.prototype, "actionLink", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendNotificationEmailDto.prototype, "footer", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['en', 'ru', 'lv']),
    __metadata("design:type", String)
], SendNotificationEmailDto.prototype, "language", void 0);
