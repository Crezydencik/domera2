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
exports.MeterReadingsService = void 0;
const common_1 = require("@nestjs/common");
const electricity_payment_service_1 = require("./electricity-payment.service");
const meter_reading_crud_service_1 = require("./meter-reading-crud.service");
const meter_reading_query_service_1 = require("./meter-reading-query.service");
const meter_reading_reminder_service_1 = require("./meter-reading-reminder.service");
let MeterReadingsService = class MeterReadingsService {
    constructor(queryService, crudService, electricityPaymentService, reminderService) {
        this.queryService = queryService;
        this.crudService = crudService;
        this.electricityPaymentService = electricityPaymentService;
        this.reminderService = reminderService;
    }
    list(user, apartmentId, companyId) {
        return this.queryService.list(user, apartmentId, companyId);
    }
    listElectricityPayments(user, query) {
        return this.electricityPaymentService.list(user, query);
    }
    createElectricityPayment(request, user, payload) {
        return this.electricityPaymentService.create(request, user, payload);
    }
    confirmElectricityPayment(request, user, paymentId, payload) {
        return this.electricityPaymentService.confirm(request, user, paymentId, payload);
    }
    removeElectricityPayment(request, user, paymentId, apartmentId) {
        return this.electricityPaymentService.remove(request, user, paymentId, apartmentId);
    }
    create(request, user, payload) {
        return this.crudService.create(request, user, payload);
    }
    update(request, user, readingId, apartmentId, payload) {
        return this.crudService.update(request, user, readingId, apartmentId, payload);
    }
    remove(request, user, readingId, apartmentId) {
        return this.crudService.remove(request, user, readingId, apartmentId);
    }
    sendTestReminder(user) {
        return this.reminderService.sendTestReminder(user);
    }
    sendManualReminder(user, payload) {
        return this.reminderService.sendManualReminder(user, payload);
    }
};
exports.MeterReadingsService = MeterReadingsService;
exports.MeterReadingsService = MeterReadingsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [meter_reading_query_service_1.MeterReadingQueryService,
        meter_reading_crud_service_1.MeterReadingCrudService,
        electricity_payment_service_1.ElectricityPaymentService,
        meter_reading_reminder_service_1.MeterReadingReminderService])
], MeterReadingsService);
