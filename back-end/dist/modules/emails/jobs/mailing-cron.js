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
var MailingResumeJob_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MailingCronController = exports.MailingResumeJob = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const swagger_1 = require("@nestjs/swagger");
const cron_secret_1 = require("../../../common/security/cron-secret");
const email_service_1 = require("../services/email.service");
let MailingResumeJob = MailingResumeJob_1 = class MailingResumeJob {
    constructor(emailService) {
        this.emailService = emailService;
        this.logger = new common_1.Logger(MailingResumeJob_1.name);
        this.running = false;
    }
    async tick() {
        if (process.env.MAILING_CRON_DISABLED === 'true' || this.running)
            return;
        this.running = true;
        try {
            await this.emailService.resumePendingMailings();
        }
        catch (error) {
            this.logger.warn(`mailing.resume.failed reason=${error instanceof Error ? error.message : String(error)}`);
        }
        finally {
            this.running = false;
        }
    }
};
exports.MailingResumeJob = MailingResumeJob;
__decorate([
    (0, schedule_1.Cron)('* * * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], MailingResumeJob.prototype, "tick", null);
exports.MailingResumeJob = MailingResumeJob = MailingResumeJob_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [email_service_1.EmailService])
], MailingResumeJob);
let MailingCronController = class MailingCronController {
    constructor(emailService) {
        this.emailService = emailService;
    }
    async informationMailings(authorization) {
        (0, cron_secret_1.assertCronSecret)(authorization);
        return this.emailService.resumePendingMailings();
    }
};
exports.MailingCronController = MailingCronController;
__decorate([
    (0, common_1.Get)('information-mailings'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Headers)('authorization')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MailingCronController.prototype, "informationMailings", null);
exports.MailingCronController = MailingCronController = __decorate([
    (0, swagger_1.ApiExcludeController)(),
    (0, common_1.Controller)('internal/cron'),
    __metadata("design:paramtypes", [email_service_1.EmailService])
], MailingCronController);
