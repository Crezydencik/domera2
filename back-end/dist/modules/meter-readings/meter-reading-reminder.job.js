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
var MeterReadingReminderJob_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MeterReadingReminderJob = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const firebase_admin_service_1 = require("../../common/infrastructure/firebase/firebase-admin.service");
const email_service_1 = require("../emails/email.service");
let MeterReadingReminderJob = MeterReadingReminderJob_1 = class MeterReadingReminderJob {
    constructor(firebaseAdminService, emailService) {
        this.firebaseAdminService = firebaseAdminService;
        this.emailService = emailService;
        this.logger = new common_1.Logger(MeterReadingReminderJob_1.name);
    }
    async sendPeriodStartReminders() {
        this.logger.debug('Starting period start reminders job...');
        try {
            const db = this.firebaseAdminService.firestore;
            const buildingsSnapshot = await db.collection('buildings').get();
            for (const buildingDoc of buildingsSnapshot.docs) {
                const building = buildingDoc.data();
                const submissionPeriod = building.submissionPeriod;
                if (!submissionPeriod || !submissionPeriod.startDay)
                    continue;
                const today = new Date();
                const isToday = today.getDate() === submissionPeriod.startDay;
                if (!isToday)
                    continue;
                const endDay = submissionPeriod.endDay || 0;
                const deadlineDate = endDay > 0
                    ? `${String(endDay).padStart(2, '0')}.${String(today.getMonth() + 1).padStart(2, '0')}.${today.getFullYear()}`
                    : undefined;
                const apartmentsSnapshot = await db
                    .collection('apartments')
                    .where('buildingId', '==', buildingDoc.id)
                    .get();
                for (const aptDoc of apartmentsSnapshot.docs) {
                    const apartment = aptDoc.data();
                    const residentEmail = apartment.residentEmail || apartment.ownerEmail;
                    if (!residentEmail)
                        continue;
                    await this.emailService.sendMeterReadingReminder({
                        to: residentEmail,
                        language: apartment.language || 'en',
                        submissionLink: '',
                        buildingName: building.name || building.address || buildingDoc.id,
                        apartmentNumber: apartment.apartment || apartment.apartmentNumber || '',
                        deadline: deadlineDate,
                    });
                }
            }
            this.logger.debug('Period start reminders sent successfully');
        }
        catch (error) {
            this.logger.error('Error sending period start reminders:', error);
        }
    }
    async sendPeriodEndReminders() {
        this.logger.debug('Starting period end reminders job...');
        try {
            const db = this.firebaseAdminService.firestore;
            const buildingsSnapshot = await db.collection('buildings').get();
            for (const buildingDoc of buildingsSnapshot.docs) {
                const building = buildingDoc.data();
                const submissionPeriod = building.submissionPeriod;
                if (!submissionPeriod || !submissionPeriod.endDay)
                    continue;
                const today = new Date();
                const isLastDay = today.getDate() === submissionPeriod.endDay;
                if (!isLastDay)
                    continue;
                const apartmentsSnapshot = await db
                    .collection('apartments')
                    .where('buildingId', '==', buildingDoc.id)
                    .get();
                const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
                const deadlineDate = `${String(today.getDate()).padStart(2, '0')}.${String(today.getMonth() + 1).padStart(2, '0')}.${today.getFullYear()}`;
                for (const aptDoc of apartmentsSnapshot.docs) {
                    const apartment = aptDoc.data();
                    const wr = (apartment.waterReadings ?? {});
                    let hasCurrentMonthReading = false;
                    for (const key of ['coldmeterwater', 'hotmeterwater']) {
                        const group = wr[key];
                        if (!group || !Array.isArray(group.history))
                            continue;
                        const found = group.history.some((r) => {
                            const ts = r.submittedAt;
                            if (!ts)
                                return false;
                            const str = ts instanceof Date ? ts.toISOString() : String(ts);
                            return str.startsWith(currentMonthStr);
                        });
                        if (found) {
                            hasCurrentMonthReading = true;
                            break;
                        }
                    }
                    if (hasCurrentMonthReading)
                        continue;
                    const residentEmail = apartment.residentEmail || apartment.ownerEmail;
                    if (!residentEmail)
                        continue;
                    await this.emailService.sendMeterReadingReminder({
                        to: residentEmail,
                        language: apartment.language || 'en',
                        submissionLink: '',
                        buildingName: building.name || building.address || buildingDoc.id,
                        apartmentNumber: apartment.apartment || apartment.apartmentNumber || '',
                        deadline: deadlineDate,
                    });
                }
            }
            this.logger.debug('Period end reminders sent successfully');
        }
        catch (error) {
            this.logger.error('Error sending period end reminders:', error);
        }
    }
};
exports.MeterReadingReminderJob = MeterReadingReminderJob;
__decorate([
    (0, schedule_1.Cron)('0 8 * * *', { timeZone: 'UTC' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], MeterReadingReminderJob.prototype, "sendPeriodStartReminders", null);
__decorate([
    (0, schedule_1.Cron)('0 18 * * *', { timeZone: 'UTC' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], MeterReadingReminderJob.prototype, "sendPeriodEndReminders", null);
exports.MeterReadingReminderJob = MeterReadingReminderJob = MeterReadingReminderJob_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        email_service_1.EmailService])
], MeterReadingReminderJob);
