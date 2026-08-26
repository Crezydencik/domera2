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
exports.MeterReadingReminderService = void 0;
const common_1 = require("@nestjs/common");
const firebase_admin_service_1 = require("../../../common/infrastructure/firebase/firebase-admin.service");
const company_payload_service_1 = require("../../company/services/company-payload.service");
const email_log_service_1 = require("../../emails/services/email-log.service");
const email_service_1 = require("../../emails/services/email.service");
const meter_reading_access_service_1 = require("./meter-reading-access.service");
let MeterReadingReminderService = class MeterReadingReminderService {
    constructor(firebaseAdminService, emailService, emailLogService, accessService, companyPayloadService) {
        this.firebaseAdminService = firebaseAdminService;
        this.emailService = emailService;
        this.emailLogService = emailLogService;
        this.accessService = accessService;
        this.companyPayloadService = companyPayloadService;
    }
    async sendTestReminder(user) {
        this.accessService.assertAuthenticated(user);
        const db = this.firebaseAdminService.firestore;
        const companyEmail = user.email;
        if (!companyEmail) {
            throw new common_1.BadRequestException('Company email not found');
        }
        const companyId = user.companyId || '';
        if (!companyId) {
            throw new common_1.BadRequestException('Company ID not found for this user');
        }
        const [snap1, snap2] = await Promise.all([
            db.collection('buildings').where('companyId', '==', companyId).limit(1).get(),
            db.collection('buildings').where('managedBy.companyId', '==', companyId).limit(1).get(),
        ]);
        const buildingsSnapshot = !snap1.empty ? snap1 : snap2;
        if (buildingsSnapshot.empty) {
            throw new common_1.NotFoundException('No buildings found for this company');
        }
        const building = buildingsSnapshot.docs[0].data();
        const buildingName = building.name || building.address || 'Test Building';
        await this.emailService.sendMeterReadingReminder({
            to: companyEmail,
            language: 'lv',
            submissionLink: '',
            companyId,
            buildingId: buildingsSnapshot.docs[0].id,
            buildingName,
            apartmentNumber: 'Apt 1',
            periodLabel: '01.05.2026 - 27.05.2026',
            deadline: '27.05.2026',
            reminderStage: 'close',
            daysUntilDeadline: 0,
        });
        return { success: true, message: 'Test reminder sent to ' + companyEmail };
    }
    async sendManualReminder(user, payload) {
        this.accessService.assertAuthenticated(user);
        const companyId = this.accessService.requireStaffCompanyId(user);
        const buildingId = this.firstString(payload.buildingId);
        if (!buildingId) {
            throw new common_1.BadRequestException('buildingId is required');
        }
        const utility = payload.utility === 'electricity' ? 'electricity' : 'water';
        const db = this.firebaseAdminService.firestore;
        const buildingSnap = await db.collection('buildings').doc(buildingId).get();
        if (!buildingSnap.exists) {
            throw new common_1.NotFoundException('Building not found');
        }
        const building = buildingSnap.data();
        const buildingCompanyId = this.buildingCompanyId(building);
        if (!buildingCompanyId || buildingCompanyId !== companyId) {
            throw new common_1.ForbiddenException('Access denied for building');
        }
        if (user.role === 'Accountant') {
            const companySnap = await db.collection('companies').doc(companyId).get();
            const permissions = companySnap.exists
                ? this.companyPayloadService.getCompanyMemberPermissions(companySnap.data(), user.uid)
                : null;
            if (!permissions?.manageMeterReadings) {
                throw new common_1.ForbiddenException('You do not have permission to edit meter readings');
            }
        }
        const apartmentsSnapshot = await db.collection('apartments').where('buildingId', '==', buildingId).get();
        const period = this.periodForBuilding(building, utility);
        const fallbackLanguage = this.emailLanguage(payload.language);
        const now = new Date();
        const result = {
            success: true,
            sent: 0,
            failed: 0,
            skippedNoEmail: 0,
            skippedSubmitted: 0,
            totalApartments: apartmentsSnapshot.size,
        };
        for (const apartmentDoc of apartmentsSnapshot.docs) {
            const apartment = apartmentDoc.data();
            const to = this.firstString(apartment.residentEmail, apartment.ownerEmail);
            if (!to) {
                result.skippedNoEmail += 1;
                continue;
            }
            if (this.hasCurrentMonthReading(apartment, utility, now)) {
                result.skippedSubmitted += 1;
                continue;
            }
            const reminderStage = period ? this.reminderStageForPeriod(period, now) : 'start';
            try {
                await this.emailService.sendMeterReadingReminder({
                    to,
                    language: this.emailLanguage(apartment.language, fallbackLanguage),
                    submissionLink: '',
                    companyId,
                    buildingId,
                    apartmentId: apartmentDoc.id,
                    brandName: this.buildingCompanyName(building),
                    buildingName: this.firstString(building.name, building.address, buildingId),
                    apartmentNumber: this.firstString(apartment.apartment, apartment.apartmentNumber, apartment.number),
                    periodLabel: period ? this.periodLabel(period, now) : undefined,
                    deadline: period ? this.periodDateLabel(period.endDate, period.monthly, now) : undefined,
                    reminderStage,
                    daysUntilDeadline: period ? this.daysUntilDeadline(period, now) : undefined,
                });
                result.sent += 1;
            }
            catch {
                result.failed += 1;
            }
        }
        return result;
    }
    async resendMissingAutoReminder(user, payload) {
        this.accessService.assertAuthenticated(user);
        const companyId = this.accessService.requireStaffCompanyId(user);
        const deliveryKey = this.firstString(payload.deliveryKey);
        const parsed = this.parseAutoReminderDeliveryKey(deliveryKey);
        if (!parsed) {
            throw new common_1.BadRequestException('Valid automatic reminder deliveryKey is required');
        }
        const { buildingId, utility, kind } = parsed;
        const db = this.firebaseAdminService.firestore;
        const buildingSnap = await db.collection('buildings').doc(buildingId).get();
        if (!buildingSnap.exists) {
            throw new common_1.NotFoundException('Building not found');
        }
        const building = buildingSnap.data();
        const buildingCompanyId = this.buildingCompanyId(building);
        if (!buildingCompanyId || buildingCompanyId !== companyId) {
            throw new common_1.ForbiddenException('Access denied for building');
        }
        if (user.role === 'Accountant') {
            const companySnap = await db.collection('companies').doc(companyId).get();
            const permissions = companySnap.exists
                ? this.companyPayloadService.getCompanyMemberPermissions(companySnap.data(), user.uid)
                : null;
            if (!permissions?.manageMeterReadings) {
                throw new common_1.ForbiddenException('You do not have permission to edit meter readings');
            }
        }
        const period = this.periodForBuilding(building, utility);
        const apartmentsSnapshot = await db.collection('apartments').where('buildingId', '==', buildingId).get();
        const fallbackLanguage = this.emailLanguage(payload.language);
        const now = new Date();
        const result = {
            success: true,
            sent: 0,
            failed: 0,
            skippedAlreadySent: 0,
            skippedNoEmail: 0,
            skippedSubmitted: 0,
            totalApartments: apartmentsSnapshot.size,
        };
        for (const apartmentDoc of apartmentsSnapshot.docs) {
            const apartment = apartmentDoc.data();
            const apartmentDeliveryKey = `${deliveryKey}:${apartmentDoc.id}`;
            if (await this.emailLogService.hasSuccessfulDeliveryKey(apartmentDeliveryKey)) {
                result.skippedAlreadySent += 1;
                continue;
            }
            const to = this.firstString(apartment.residentEmail, apartment.ownerEmail);
            if (!to) {
                result.skippedNoEmail += 1;
                continue;
            }
            if (kind !== 'start' && this.hasCurrentMonthReading(apartment, utility, now)) {
                result.skippedSubmitted += 1;
                continue;
            }
            try {
                await this.emailService.sendMeterReadingReminder({
                    to,
                    language: this.emailLanguage(apartment.language, fallbackLanguage),
                    submissionLink: '',
                    companyId,
                    buildingId,
                    apartmentId: apartmentDoc.id,
                    deliveryKey: apartmentDeliveryKey,
                    brandName: this.buildingCompanyName(building),
                    buildingName: this.firstString(building.name, building.address, buildingId),
                    apartmentNumber: this.firstString(apartment.apartment, apartment.apartmentNumber, apartment.number),
                    periodLabel: period ? this.periodLabel(period, now) : undefined,
                    deadline: period ? this.periodDateLabel(period.endDate, period.monthly, now) : undefined,
                    reminderStage: kind,
                    daysUntilDeadline: period ? this.daysUntilDeadline(period, now) : undefined,
                });
                result.sent += 1;
            }
            catch {
                result.failed += 1;
            }
        }
        return result;
    }
    periodForBuilding(building, utility) {
        const readingConfig = building.readingConfig && typeof building.readingConfig === 'object'
            ? building.readingConfig
            : {};
        const source = utility === 'electricity'
            ? readingConfig.electricitySubmissionPeriod
            : readingConfig.waterSubmissionPeriod ?? readingConfig.submissionPeriod;
        return this.normalizePeriod(source);
    }
    normalizePeriod(source) {
        if (!source || typeof source !== 'object')
            return null;
        const period = source;
        const startDate = this.firstString(period.startDate);
        const endDate = this.firstString(period.endDate);
        if (!startDate || !endDate)
            return null;
        return { startDate, endDate, monthly: Boolean(period.monthly) };
    }
    buildingCompanyId(building) {
        const managedBy = building.managedBy && typeof building.managedBy === 'object'
            ? building.managedBy
            : {};
        return this.firstString(building.companyId, managedBy.companyId);
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
            if (typeof value === 'number' && Number.isFinite(value))
                return String(value);
        }
        return '';
    }
    parseAutoReminderDeliveryKey(value) {
        const [prefix, buildingId, utility, kind, targetDate] = value.split(':');
        if (prefix !== 'meter-reading-reminder' ||
            !buildingId ||
            (utility !== 'water' && utility !== 'electricity') ||
            (kind !== 'start' && kind !== 'end' && kind !== 'close') ||
            !/^\d{4}-\d{2}-\d{2}$/.test(targetDate ?? '')) {
            return null;
        }
        return { buildingId, utility, kind, targetDate };
    }
    emailLanguage(...values) {
        for (const value of values) {
            if (typeof value !== 'string')
                continue;
            const code = value.slice(0, 2).toLowerCase();
            if (code === 'en' || code === 'ru' || code === 'lv')
                return code;
        }
        return 'lv';
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
    reminderStageForPeriod(period, now) {
        if (this.isPeriodDateToday(period.startDate, period.monthly, now))
            return 'start';
        if (this.isPeriodDateToday(period.endDate, period.monthly, now))
            return 'close';
        return 'end';
    }
    isPeriodDateToday(dateValue, monthly, now) {
        const date = new Date(dateValue);
        if (Number.isNaN(date.getTime()))
            return false;
        if (monthly)
            return date.getUTCDate() === now.getUTCDate();
        return date.toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
    }
    hasCurrentMonthReading(apartment, utility, now) {
        const wr = (apartment.waterReadings ?? {});
        const keys = utility === 'water'
            ? ['coldmeterwater', 'hotmeterwater']
            : ['electricitymeter'];
        return keys.some((key) => {
            const group = wr[key];
            if (!group || !Array.isArray(group.history))
                return false;
            return group.history.some((reading) => {
                const month = Number(reading.month);
                const year = Number(reading.year);
                return Number.isFinite(month)
                    && Number.isFinite(year)
                    && year === now.getUTCFullYear()
                    && month === now.getUTCMonth() + 1;
            });
        });
    }
};
exports.MeterReadingReminderService = MeterReadingReminderService;
exports.MeterReadingReminderService = MeterReadingReminderService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        email_service_1.EmailService,
        email_log_service_1.EmailLogService,
        meter_reading_access_service_1.MeterReadingAccessService,
        company_payload_service_1.CompanyPayloadService])
], MeterReadingReminderService);
