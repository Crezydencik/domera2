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
var EmailService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailService = void 0;
const common_1 = require("@nestjs/common");
const email_template_service_1 = require("./email-template.service");
const email_transport_service_1 = require("./email-transport.service");
let EmailService = EmailService_1 = class EmailService {
    constructor(transportService, templateService) {
        this.transportService = transportService;
        this.templateService = templateService;
        this.logger = new common_1.Logger(EmailService_1.name);
    }
    send(payload) {
        return this.transportService.send(payload);
    }
    async sendRegistrationCode(dto) {
        const template = this.templateService.registrationCode(dto);
        return this.send({ to: dto.to, subject: template.subject, html: template.html });
    }
    async sendPasswordReset(dto) {
        const template = this.templateService.passwordReset(dto);
        return this.send({ to: dto.to, subject: template.subject, html: template.html });
    }
    async sendOwnerInvitation(dto) {
        const template = this.templateService.ownerInvitation(dto);
        this.logger.log(`Sending owner invitation to ${dto.to}`);
        return this.send({ to: dto.to, subject: template.subject, html: template.html });
    }
    async sendTenantInvitation(dto) {
        const template = this.templateService.tenantInvitation(dto);
        return this.send({ to: dto.to, subject: template.subject, html: template.html });
    }
    async sendTenantInvitedByOwner(dto) {
        const template = this.templateService.tenantInvitedByOwner(dto);
        return this.send({ to: dto.to, subject: template.subject, html: template.html });
    }
    async sendInvoiceGenerated(dto) {
        const template = this.templateService.invoiceGenerated(dto);
        return this.send({
            to: dto.to,
            subject: template.subject,
            html: template.html,
            attachments: dto.attachments,
        });
    }
    async sendMeterReadingReminder(dto) {
        const template = this.templateService.meterReadingReminder(dto);
        return this.send({ to: dto.to, subject: template.subject, html: template.html });
    }
    async sendNotification(dto) {
        const template = this.templateService.notification(dto);
        return this.send({ to: dto.to, subject: template.subject, html: template.html });
    }
};
exports.EmailService = EmailService;
exports.EmailService = EmailService = EmailService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [email_transport_service_1.EmailTransportService,
        email_template_service_1.EmailTemplateService])
], EmailService);
