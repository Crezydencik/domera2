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
exports.EmailService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const resend_1 = require("resend");
const templates = require("./templates");
let EmailService = class EmailService {
    constructor(configService) {
        this.configService = configService;
        this.apiKey = this.configService.get('RESEND_API_KEY') || '';
        this.from = this.configService.get('RESEND_FROM') || '';
        if (this.apiKey && this.from) {
            this.resend = new resend_1.Resend(this.apiKey);
        }
    }
    async send(payload) {
        if (!this.resend || !this.apiKey || !this.from) {
            throw new Error('Email service is not configured. Set RESEND_API_KEY and RESEND_FROM.');
        }
        try {
            const response = await this.resend.emails.send({
                from: this.from,
                to: payload.to,
                subject: payload.subject,
                html: payload.html,
            });
            if (response.error) {
                throw new Error(`Resend error: ${response.error.message}`);
            }
            return { id: response.data?.id || '' };
        }
        catch (error) {
            console.error('Error sending email:', error);
            throw error;
        }
    }
    async sendRegistrationCode(dto) {
        const language = this.normalizeLanguage(dto.language);
        const template = templates.registrationCodeTemplates[language](dto.code);
        return this.send({
            to: dto.to,
            subject: template.subject,
            html: template.html,
        });
    }
    async sendPasswordReset(dto) {
        const language = this.normalizeLanguage(dto.language);
        const template = templates.passwordResetTemplates[language](dto.resetLink);
        return this.send({
            to: dto.to,
            subject: template.subject,
            html: template.html,
        });
    }
    async sendOwnerInvitation(dto) {
        const language = this.normalizeLanguage(dto.language);
        const template = templates.ownerInvitationTemplates[language]({
            companyName: dto.companyName,
            invitationLink: dto.invitationLink,
            senderName: dto.senderName,
        });
        return this.send({
            to: dto.to,
            subject: template.subject,
            html: template.html,
        });
    }
    async sendTenantInvitation(dto) {
        const language = this.normalizeLanguage(dto.language);
        const template = templates.tenantInvitationTemplates[language]({
            companyName: dto.companyName,
            buildingName: dto.buildingName,
            apartmentNumber: dto.apartmentNumber,
            invitationLink: dto.invitationLink,
            senderName: dto.senderName,
        });
        return this.send({
            to: dto.to,
            subject: template.subject,
            html: template.html,
        });
    }
    async sendTenantInvitedByOwner(dto) {
        const language = this.normalizeLanguage(dto.language);
        const template = templates.tenantInvitedByOwnerTemplates[language]({
            tenantName: dto.tenantName,
            ownerName: dto.ownerName,
            buildingName: dto.buildingName,
            apartmentNumber: dto.apartmentNumber,
            invitationLink: dto.invitationLink,
        });
        return this.send({
            to: dto.to,
            subject: template.subject,
            html: template.html,
        });
    }
    async sendInvoiceGenerated(dto) {
        const language = this.normalizeLanguage(dto.language);
        const template = templates.invoiceGeneratedTemplates[language]({
            tenantName: dto.tenantName,
            apartmentNumber: dto.apartmentNumber,
            buildingName: dto.buildingName,
            invoiceNumber: dto.invoiceNumber,
            amount: dto.amount,
            dueDate: dto.dueDate,
            invoiceLink: dto.invoiceLink,
        });
        return this.send({
            to: dto.to,
            subject: template.subject,
            html: template.html,
        });
    }
    async sendMeterReadingReminder(dto) {
        const language = this.normalizeLanguage(dto.language);
        const template = templates.meterReadingReminderTemplates[language]({
            tenantName: dto.tenantName,
            apartmentNumber: dto.apartmentNumber,
            buildingName: dto.buildingName,
            meters: dto.meters || [],
            submissionLink: dto.submissionLink,
            deadline: dto.deadline,
        });
        return this.send({
            to: dto.to,
            subject: template.subject,
            html: template.html,
        });
    }
    async sendNotification(dto) {
        const language = this.normalizeLanguage(dto.language);
        const template = templates.notificationTemplates[language]({
            title: dto.title,
            message: dto.message,
            actionLabel: dto.actionLabel,
            actionLink: dto.actionLink,
            footer: dto.footer,
        });
        return this.send({
            to: dto.to,
            subject: template.subject,
            html: template.html,
        });
    }
    normalizeLanguage(language) {
        if (!language)
            return 'lv';
        const code = language.slice(0, 2).toLowerCase();
        if (code === 'ru' || code === 'lv')
            return code;
        return 'lv';
    }
};
exports.EmailService = EmailService;
exports.EmailService = EmailService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], EmailService);
