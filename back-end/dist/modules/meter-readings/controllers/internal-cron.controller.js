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
exports.InternalCronController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const cron_secret_1 = require("../../../common/security/cron-secret");
const meter_reading_reminder_job_1 = require("../jobs/meter-reading-reminder.job");
let InternalCronController = class InternalCronController {
    constructor(reminderJob) {
        this.reminderJob = reminderJob;
    }
    async meterReadingReminders(authorization) {
        (0, cron_secret_1.assertCronSecret)(authorization);
        return this.reminderJob.sendConfiguredReminders();
    }
};
exports.InternalCronController = InternalCronController;
__decorate([
    (0, common_1.Get)('meter-reading-reminders'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Headers)('authorization')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], InternalCronController.prototype, "meterReadingReminders", null);
exports.InternalCronController = InternalCronController = __decorate([
    (0, swagger_1.ApiExcludeController)(),
    (0, common_1.Controller)('internal/cron'),
    __metadata("design:paramtypes", [meter_reading_reminder_job_1.MeterReadingReminderJob])
], InternalCronController);
