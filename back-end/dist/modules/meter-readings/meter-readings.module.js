"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MeterReadingsModule = void 0;
const common_1 = require("@nestjs/common");
const email_module_1 = require("../emails/email.module");
const meter_readings_controller_1 = require("./controllers/meter-readings.controller");
const meter_reading_reminder_job_1 = require("./jobs/meter-reading-reminder.job");
const electricity_payment_service_1 = require("./services/electricity-payment.service");
const meter_reading_access_service_1 = require("./services/meter-reading-access.service");
const meter_reading_building_service_1 = require("./services/meter-reading-building.service");
const meter_reading_crud_service_1 = require("./services/meter-reading-crud.service");
const meter_reading_helper_service_1 = require("./services/meter-reading-helper.service");
const meter_reading_query_service_1 = require("./services/meter-reading-query.service");
const meter_reading_reminder_service_1 = require("./services/meter-reading-reminder.service");
const meter_readings_service_1 = require("./services/meter-readings.service");
let MeterReadingsModule = class MeterReadingsModule {
};
exports.MeterReadingsModule = MeterReadingsModule;
exports.MeterReadingsModule = MeterReadingsModule = __decorate([
    (0, common_1.Module)({
        imports: [email_module_1.EmailModule],
        controllers: [meter_readings_controller_1.MeterReadingsController],
        providers: [
            meter_readings_service_1.MeterReadingsService,
            meter_reading_access_service_1.MeterReadingAccessService,
            meter_reading_helper_service_1.MeterReadingHelperService,
            meter_reading_building_service_1.MeterReadingBuildingService,
            meter_reading_query_service_1.MeterReadingQueryService,
            meter_reading_crud_service_1.MeterReadingCrudService,
            electricity_payment_service_1.ElectricityPaymentService,
            meter_reading_reminder_service_1.MeterReadingReminderService,
            meter_reading_reminder_job_1.MeterReadingReminderJob,
        ],
    })
], MeterReadingsModule);
