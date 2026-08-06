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
const email_service_1 = require("../../emails/services/email.service");
const meter_reading_access_service_1 = require("./meter-reading-access.service");
let MeterReadingReminderService = class MeterReadingReminderService {
    constructor(firebaseAdminService, emailService, accessService) {
        this.firebaseAdminService = firebaseAdminService;
        this.emailService = emailService;
        this.accessService = accessService;
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
            language: 'en',
            submissionLink: '',
            buildingName,
            apartmentNumber: 'Apt 1',
            deadline: '27.05.2026',
        });
        return { success: true, message: 'Test reminder sent to ' + companyEmail };
    }
};
exports.MeterReadingReminderService = MeterReadingReminderService;
exports.MeterReadingReminderService = MeterReadingReminderService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        email_service_1.EmailService,
        meter_reading_access_service_1.MeterReadingAccessService])
], MeterReadingReminderService);
