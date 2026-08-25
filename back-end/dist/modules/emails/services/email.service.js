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
const email_log_service_1 = require("./email-log.service");
const email_template_service_1 = require("./email-template.service");
const email_transport_service_1 = require("./email-transport.service");
let EmailService = EmailService_1 = class EmailService {
    constructor(transportService, templateService, emailLogService) {
        this.transportService = transportService;
        this.templateService = templateService;
        this.emailLogService = emailLogService;
        this.logger = new common_1.Logger(EmailService_1.name);
    }
    send(payload) {
        return this.transportService.send(payload);
    }
    async sendTracked(type, payload, context = {}) {
        try {
            const result = await this.send(payload);
            await this.emailLogService.record({
                type,
                status: 'success',
                to: payload.to,
                subject: payload.subject,
                providerMessageId: result.id,
                ...context,
            });
            return result;
        }
        catch (error) {
            await this.emailLogService.record({
                type,
                status: 'error',
                to: payload.to,
                subject: payload.subject,
                errorMessage: error instanceof Error ? error.message : String(error),
                ...context,
            });
            throw error;
        }
    }
    async sendRegistrationCode(dto) {
        const template = this.templateService.registrationCode(dto);
        return this.sendTracked('registrationCode', { to: dto.to, subject: template.subject, html: template.html });
    }
    async sendPasswordReset(dto) {
        const template = this.templateService.passwordReset(dto);
        return this.sendTracked('passwordReset', { to: dto.to, subject: template.subject, html: template.html });
    }
    async sendOwnerInvitation(dto) {
        const template = this.templateService.ownerInvitation(dto);
        this.logger.log(`Sending owner invitation to ${dto.to}`);
        return this.sendTracked('ownerInvitation', { to: dto.to, subject: template.subject, html: template.html });
    }
    async sendTenantInvitation(dto) {
        const template = this.templateService.tenantInvitation(dto);
        return this.sendTracked('tenantInvitation', { to: dto.to, subject: template.subject, html: template.html });
    }
    async sendTenantInvitedByOwner(dto) {
        const template = this.templateService.tenantInvitedByOwner(dto);
        return this.sendTracked('tenantInvitedByOwner', { to: dto.to, subject: template.subject, html: template.html });
    }
    async sendInvoiceGenerated(dto) {
        const template = this.templateService.invoiceGenerated(dto);
        return this.sendTracked('invoiceGenerated', {
            to: dto.to,
            subject: template.subject,
            html: template.html,
            attachments: dto.attachments,
        }, {
            companyId: dto.companyId,
            buildingId: dto.buildingId,
            apartmentId: dto.apartmentId,
            metadata: { invoiceNumber: dto.invoiceNumber },
        });
    }
    async sendMeterReadingReminder(dto) {
        const template = this.templateService.meterReadingReminder(dto);
        return this.sendTracked('meterReadingReminder', { to: dto.to, subject: template.subject, html: template.html }, {
            companyId: dto.companyId,
            buildingId: dto.buildingId,
            apartmentId: dto.apartmentId,
            deliveryKey: dto.deliveryKey,
            metadata: { reminderStage: dto.reminderStage, deadline: dto.deadline },
        });
    }
    async sendNotification(dto) {
        const template = this.templateService.notification(dto);
        return this.sendTracked('notification', { to: dto.to, subject: template.subject, html: template.html }, {
            companyId: dto.companyId,
            buildingId: dto.buildingId,
            apartmentId: dto.apartmentId,
            deliveryKey: dto.deliveryKey,
        });
    }
};
exports.EmailService = EmailService;
exports.EmailService = EmailService = EmailService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [email_transport_service_1.EmailTransportService,
        email_template_service_1.EmailTemplateService,
        email_log_service_1.EmailLogService])
], EmailService);
