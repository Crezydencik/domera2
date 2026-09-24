"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailTemplateService = void 0;
const common_1 = require("@nestjs/common");
const templates = require("../templates");
let EmailTemplateService = class EmailTemplateService {
    registrationCode(dto) {
        const language = this.normalizeLanguage(dto.language);
        return templates.registrationCodeTemplates[language](dto.code);
    }
    passwordReset(dto) {
        const language = this.normalizeLanguage(dto.language);
        return templates.passwordResetTemplates[language](dto.resetLink);
    }
    ownerInvitation(dto) {
        const language = this.normalizeLanguage(dto.language);
        return templates.ownerInvitationTemplates[language]({
            companyName: dto.companyName,
            brandName: dto.companyName,
            ownerName: dto.ownerName,
            ownerEmail: dto.ownerEmail || dto.to,
            invitationLink: dto.invitationLink,
            buildingName: dto.buildingName,
            apartmentNumber: dto.apartmentNumber,
        });
    }
    tenantInvitation(dto) {
        const language = this.normalizeLanguage(dto.language);
        return templates.tenantInvitationTemplates[language]({
            companyName: dto.companyName,
            brandName: dto.companyName,
            buildingName: dto.buildingName,
            apartmentNumber: dto.apartmentNumber,
            invitationLink: dto.invitationLink,
            senderName: dto.senderName,
        });
    }
    tenantInvitedByOwner(dto) {
        const language = this.normalizeLanguage(dto.language);
        return templates.tenantInvitedByOwnerTemplates[language]({
            tenantName: dto.tenantName,
            brandName: dto.brandName,
            ownerName: dto.ownerName,
            buildingName: dto.buildingName,
            apartmentNumber: dto.apartmentNumber,
            invitationLink: dto.invitationLink,
        });
    }
    invoiceGenerated(dto) {
        const language = this.normalizeLanguage(dto.language);
        return templates.invoiceGeneratedTemplates[language]({
            tenantName: dto.tenantName,
            brandName: dto.brandName,
            apartmentNumber: dto.apartmentNumber,
            buildingName: dto.buildingName,
            invoiceNumber: dto.invoiceNumber,
            amount: dto.amount,
            dueDate: dto.dueDate,
            invoiceLink: dto.invoiceLink,
        });
    }
    meterReadingReminder(dto) {
        const language = this.normalizeLanguage(dto.language);
        return templates.meterReadingReminderTemplates[language]({
            tenantName: dto.tenantName,
            brandName: dto.brandName,
            apartmentNumber: dto.apartmentNumber,
            buildingName: dto.buildingName,
            meters: dto.meters || [],
            submissionLink: dto.submissionLink,
            periodLabel: dto.periodLabel,
            deadline: dto.deadline,
            reminderStage: dto.reminderStage,
            daysUntilDeadline: dto.daysUntilDeadline,
        });
    }
    notification(dto) {
        const language = this.normalizeLanguage(dto.language);
        return templates.notificationTemplates[language]({
            title: dto.title,
            message: dto.message,
            actionLabel: dto.actionLabel,
            actionLink: dto.actionLink,
            brandName: dto.brandName,
            footer: dto.footer,
        });
    }
    normalizeLanguage(language) {
        if (!language)
            return 'lv';
        const code = language.slice(0, 2).toLowerCase();
        if (code === 'en' || code === 'ru' || code === 'lv')
            return code;
        return 'lv';
    }
};
exports.EmailTemplateService = EmailTemplateService;
exports.EmailTemplateService = EmailTemplateService = __decorate([
    (0, common_1.Injectable)()
], EmailTemplateService);
