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
var EmailTransportService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailTransportService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const resend_1 = require("resend");
let EmailTransportService = EmailTransportService_1 = class EmailTransportService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(EmailTransportService_1.name);
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
                attachments: payload.attachments?.map((attachment) => ({
                    filename: attachment.filename,
                    content: attachment.content,
                    contentType: attachment.contentType,
                })),
            });
            if (response.error) {
                throw new Error(`Resend error: ${response.error.message}`);
            }
            return { id: response.data?.id || '' };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`Failed to send email to ${payload.to}: ${message}`);
            throw error;
        }
    }
};
exports.EmailTransportService = EmailTransportService;
exports.EmailTransportService = EmailTransportService = EmailTransportService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], EmailTransportService);
