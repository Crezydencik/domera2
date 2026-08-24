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
const firebase_admin_service_1 = require("../../../common/infrastructure/firebase/firebase-admin.service");
const email_service_1 = require("../../emails/services/email.service");
let MeterReadingReminderJob = MeterReadingReminderJob_1 = class MeterReadingReminderJob {
    constructor(firebaseAdminService, emailService) {
        this.firebaseAdminService = firebaseAdminService;
        this.emailService = emailService;
        this.logger = new common_1.Logger(MeterReadingReminderJob_1.name);
    }
    async sendConfiguredReminders() {
        const now = new Date();
        const currentTime = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;
        try {
            const db = this.firebaseAdminService.firestore;
            const buildingsSnapshot = await db.collection('buildings').get();
            for (const buildingDoc of buildingsSnapshot.docs) {
                const building = buildingDoc.data();
                const periods = this.periodsForBuilding(building);
                const dueReminders = periods.filter(({ period, kind }) => this.isReminderDue(period, kind, now, currentTime));
                if (dueReminders.length === 0)
                    continue;
                const apartmentsSnapshot = await db
                    .collection('apartments')
                    .where('buildingId', '==', buildingDoc.id)
                    .get();
                for (const aptDoc of apartmentsSnapshot.docs) {
                    const apartment = aptDoc.data();
                    const residentEmail = apartment.residentEmail || apartment.ownerEmail;
                    if (!residentEmail)
                        continue;
                    const shouldSend = dueReminders.some(({ kind, utility }) => (kind === 'start' || !this.hasCurrentMonthReading(apartment, utility, now)));
                    if (!shouldSend)
                        continue;
                    const deadline = dueReminders
                        .map(({ period }) => this.deadlineLabel(period, now))
                        .find(Boolean);
                    const periodLabel = dueReminders
                        .map(({ period }) => this.periodLabel(period, now))
                        .find(Boolean);
                    const reminderStage = this.reminderStage(dueReminders.map(({ kind }) => kind));
                    const daysUntilDeadline = dueReminders
                        .map(({ period }) => this.daysUntilDeadline(period, now))
                        .filter((value) => value !== undefined)
                        .sort((a, b) => a - b)[0];
                    await this.emailService.sendMeterReadingReminder({
                        to: residentEmail,
                        language: apartment.language || 'en',
                        submissionLink: '',
                        brandName: this.buildingCompanyName(building),
                        buildingName: building.name || building.address || buildingDoc.id,
                        apartmentNumber: apartment.apartment || apartment.apartmentNumber || '',
                        periodLabel,
                        deadline,
                        reminderStage,
                        daysUntilDeadline,
                    });
                }
            }
        }
        catch (error) {
            this.logger.error('Error sending configured meter reading reminders:', error);
        }
    }
    periodsForBuilding(building) {
        const readingConfig = building.readingConfig && typeof building.readingConfig === 'object'
            ? building.readingConfig
            : {};
        const periods = [];
        const waterPeriod = this.normalizePeriod(readingConfig.waterSubmissionPeriod ?? readingConfig.submissionPeriod);
        const electricityPeriod = this.normalizePeriod(readingConfig.electricitySubmissionPeriod);
        if (waterPeriod) {
            periods.push({ utility: 'water', kind: 'start', period: waterPeriod });
            periods.push({ utility: 'water', kind: 'end', period: waterPeriod });
            periods.push({ utility: 'water', kind: 'close', period: waterPeriod });
        }
        if (electricityPeriod) {
            periods.push({ utility: 'electricity', kind: 'start', period: electricityPeriod });
            periods.push({ utility: 'electricity', kind: 'end', period: electricityPeriod });
            periods.push({ utility: 'electricity', kind: 'close', period: electricityPeriod });
        }
        return periods;
    }
    normalizePeriod(source) {
        if (!source || typeof source !== 'object')
            return null;
        const period = source;
        const startDate = typeof period.startDate === 'string' ? period.startDate.trim() : '';
        const endDate = typeof period.endDate === 'string' ? period.endDate.trim() : '';
        if (!startDate || !endDate)
            return null;
        return {
            startDate,
            endDate,
            monthly: Boolean(period.monthly),
            reminders: this.normalizeReminders(period.reminders),
        };
    }
    buildingCompanyName(building) {
        const managedBy = building.managedBy && typeof building.managedBy === 'object'
            ? building.managedBy
            : {};
        return this.firstString(managedBy.companyName, building.companyName, building.managementCompanyName, managedBy.name);
    }
    firstString(...values) {
        for (const value of values) {
            if (typeof value === 'string' && value.trim())
                return value.trim();
        }
        return undefined;
    }
    reminderStage(kinds) {
        if (kinds.includes('close'))
            return 'close';
        if (kinds.includes('end'))
            return 'end';
        return 'start';
    }
    normalizeReminders(source) {
        const reminders = source && typeof source === 'object' ? source : {};
        return {
            enabled: reminders.enabled !== false,
            onStart: reminders.onStart !== false,
            onEnd: reminders.onEnd !== false,
            onClose: reminders.onClose !== false,
            startTime: this.normalizeTime(reminders.startTime, '08:00'),
            endTime: this.normalizeTime(reminders.endTime, '18:00'),
            closeTime: this.normalizeTime(reminders.closeTime, '18:00'),
            startOffsetDays: 0,
            endOffsetDays: this.normalizeOffsetDays(reminders.endOffsetDays, 1),
            closeOffsetDays: this.normalizeOffsetDays(reminders.closeOffsetDays, 0),
        };
    }
    normalizeOffsetDays(value, fallback) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? Math.min(31, Math.max(0, Math.floor(parsed))) : fallback;
    }
    normalizeTime(value, fallback) {
        return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value.trim()) ? value.trim() : fallback;
    }
    isReminderDue(period, kind, now, currentTime) {
        const reminders = period.reminders ?? this.normalizeReminders(null);
        if (!reminders.enabled)
            return false;
        if (kind === 'start' && (!reminders.onStart || reminders.startTime !== currentTime))
            return false;
        if (kind === 'end' && (!reminders.onEnd || reminders.endTime !== currentTime))
            return false;
        if (kind === 'close' && (!reminders.onClose || reminders.closeTime !== currentTime))
            return false;
        const targetDate = kind === 'start'
            ? this.shiftDate(period.startDate, reminders.startOffsetDays)
            : kind === 'end'
                ? this.shiftDate(period.endDate, -reminders.endOffsetDays)
                : this.shiftDate(period.endDate, -reminders.closeOffsetDays);
        return this.isPeriodDateToday(targetDate, period.monthly, now);
    }
    shiftDate(dateValue, days) {
        const date = new Date(dateValue);
        if (Number.isNaN(date.getTime()))
            return dateValue;
        date.setUTCDate(date.getUTCDate() + days);
        return date.toISOString().slice(0, 10);
    }
    isPeriodDateToday(dateValue, monthly, now) {
        const date = new Date(dateValue);
        if (Number.isNaN(date.getTime()))
            return false;
        if (monthly)
            return date.getUTCDate() === now.getUTCDate();
        return date.toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
    }
    deadlineLabel(period, now) {
        return this.periodDateLabel(period.endDate, period.monthly, now);
    }
    periodLabel(period, now) {
        const start = this.periodDateLabel(period.startDate, period.monthly, now);
        const end = this.periodDateLabel(period.endDate, period.monthly, now);
        if (!start || !end)
            return undefined;
        return `${start} - ${end}`;
    }
    periodDateLabel(dateValue, monthly, now) {
        const date = new Date(dateValue);
        if (Number.isNaN(date.getTime()))
            return undefined;
        const year = monthly ? now.getUTCFullYear() : date.getUTCFullYear();
        const month = monthly ? now.getUTCMonth() + 1 : date.getUTCMonth() + 1;
        return `${String(date.getUTCDate()).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}`;
    }
    daysUntilDeadline(period, now) {
        const endDate = new Date(period.endDate);
        if (Number.isNaN(endDate.getTime()))
            return undefined;
        const deadline = new Date(Date.UTC(period.monthly ? now.getUTCFullYear() : endDate.getUTCFullYear(), period.monthly ? now.getUTCMonth() : endDate.getUTCMonth(), endDate.getUTCDate()));
        const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        return Math.max(0, Math.ceil((deadline.getTime() - today.getTime()) / 86400000));
    }
    hasCurrentMonthReading(apartment, utility, now) {
        const wr = (apartment.waterReadings ?? {});
        const keys = utility === 'water'
            ? ['coldmeterwater', 'hotmeterwater']
            : ['electricitymeter'];
        const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
        return keys.some((key) => {
            const group = wr[key];
            if (!group || !Array.isArray(group.history))
                return false;
            return group.history.some((reading) => {
                const month = Number(reading.month);
                const year = Number(reading.year);
                if (Number.isFinite(month) && Number.isFinite(year)) {
                    return year === now.getUTCFullYear() && month === now.getUTCMonth() + 1;
                }
                const submittedAt = reading.submittedAt;
                if (!submittedAt)
                    return false;
                if (submittedAt instanceof Date)
                    return submittedAt.toISOString().startsWith(currentMonth);
                if (typeof submittedAt === 'object' && typeof submittedAt.toDate === 'function') {
                    return submittedAt.toDate().toISOString().startsWith(currentMonth);
                }
                return String(submittedAt).startsWith(currentMonth);
            });
        });
    }
};
exports.MeterReadingReminderJob = MeterReadingReminderJob;
__decorate([
    (0, schedule_1.Cron)('* * * * *', { timeZone: 'UTC' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], MeterReadingReminderJob.prototype, "sendConfiguredReminders", null);
exports.MeterReadingReminderJob = MeterReadingReminderJob = MeterReadingReminderJob_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        email_service_1.EmailService])
], MeterReadingReminderJob);
