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
exports.AuthEmailService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const resend_1 = require("resend");
const templates_1 = require("../../emails/templates");
const email_layout_template_1 = require("../../emails/templates/email-layout.template");
let AuthEmailService = class AuthEmailService {
    constructor(configService) {
        this.configService = configService;
    }
    async sendRegistrationCode(email, locale, code) {
        const template = templates_1.registrationCodeTemplates[locale](code);
        return this.sendEmail(email, template.subject, template.html);
    }
    async sendEmailChangeVerification(email, link) {
        const template = this.getEmailChangeTemplate(link);
        return this.sendEmail(email, template.subject, template.html);
    }
    async sendPasswordReset(email, lang, resetLink) {
        const template = templates_1.passwordResetTemplates[lang](resetLink);
        return this.sendEmail(email, template.subject, template.html);
    }
    async sendEmail(to, subject, html) {
        const resendConfig = this.getResendConfig();
        const resend = new resend_1.Resend(resendConfig.apiKey);
        const { error } = await resend.emails.send({
            from: resendConfig.from,
            to,
            subject,
            html,
        });
        if (error) {
            return { errorMessage: error.message };
        }
        return {};
    }
    getEmailChangeTemplate(link) {
        return {
            subject: 'Domera e-pasta mainas apstiprinasana',
            html: (0, email_layout_template_1.renderEmailLayout)({
                language: 'lv',
                title: 'Apstipriniet e-pasta mainu',
                badge: 'Drosiba',
                children: `
          ${(0, email_layout_template_1.paragraph)('Lai mainitu savu Domera konta e-pastu, nospiediet pogu zemak.')}
          ${(0, email_layout_template_1.button)('Apstiprinat e-pastu', link)}
          ${(0, email_layout_template_1.note)('Saite ir deriga 30 minutes. Ja neesat pieprasijis e-pasta mainu, varat ignoret so zinojumu.')}
        `,
            }),
        };
    }
    getResendConfig() {
        const apiKey = this.configService.get('RESEND_API_KEY');
        const from = this.configService.get('RESEND_FROM');
        const allowedDomain = this.configService.get('RESEND_ALLOWED_DOMAIN') ?? 'lumtach.com';
        if (!apiKey || !from) {
            throw new Error('Resend is not configured. Please set RESEND_API_KEY and RESEND_FROM');
        }
        if (!this.isAllowedSenderDomain(from, allowedDomain)) {
            throw new Error(`Invalid RESEND_FROM: sender domain must be ${allowedDomain}`);
        }
        return { apiKey, from };
    }
    isAllowedSenderDomain(from, allowedDomain) {
        const email = this.extractEmailFromFromField(from);
        const atIndex = email.lastIndexOf('@');
        if (atIndex === -1)
            return false;
        const domain = email.slice(atIndex + 1);
        return domain === allowedDomain.toLowerCase();
    }
    extractEmailFromFromField(from) {
        const trimmed = from.trim();
        const angleBracketMatch = trimmed.match(/<([^>]+)>/);
        return (angleBracketMatch?.[1] ?? trimmed).trim().toLowerCase();
    }
};
exports.AuthEmailService = AuthEmailService;
exports.AuthEmailService = AuthEmailService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], AuthEmailService);
