"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const schedule_1 = require("@nestjs/schedule");
const common_module_1 = require("./common/common.module");
const domain_event_bus_1 = require("./common/events/domain-event-bus");
const in_memory_domain_event_bus_1 = require("./common/events/in-memory-domain-event-bus");
const firebase_admin_module_1 = require("./common/infrastructure/firebase/firebase-admin.module");
const apartments_module_1 = require("./modules/apartments/apartments.module");
const auth_module_1 = require("./modules/auth/auth.module");
const buildings_module_1 = require("./modules/buildings/buildings.module");
const company_module_1 = require("./modules/company/company.module");
const company_invitations_module_1 = require("./modules/company-invitations/company-invitations.module");
const email_module_1 = require("./modules/emails/email.module");
const invoices_module_1 = require("./modules/invoices/invoices.module");
const invitations_module_1 = require("./modules/invitations/invitations.module");
const meter_readings_module_1 = require("./modules/meter-readings/meter-readings.module");
const news_module_1 = require("./modules/news/news.module");
const notifications_module_1 = require("./modules/notifications/notifications.module");
const projects_module_1 = require("./modules/projects/projects.module");
const resident_module_1 = require("./modules/resident/resident.module");
const users_module_1 = require("./modules/users/users.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            schedule_1.ScheduleModule.forRoot(),
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                envFilePath: ['.env', '.env.local'],
            }),
            common_module_1.CommonModule,
            firebase_admin_module_1.FirebaseAdminModule,
            auth_module_1.AuthModule,
            email_module_1.EmailModule,
            buildings_module_1.BuildingsModule,
            company_module_1.CompanyModule,
            invitations_module_1.InvitationsModule,
            company_invitations_module_1.CompanyInvitationsModule,
            apartments_module_1.ApartmentsModule,
            invoices_module_1.InvoicesModule,
            meter_readings_module_1.MeterReadingsModule,
            notifications_module_1.NotificationsModule,
            projects_module_1.ProjectsModule,
            news_module_1.NewsModule,
            users_module_1.UsersModule,
            resident_module_1.ResidentModule,
        ],
        providers: [
            in_memory_domain_event_bus_1.InMemoryDomainEventBus,
            {
                provide: domain_event_bus_1.DOMAIN_EVENT_BUS,
                useExisting: in_memory_domain_event_bus_1.InMemoryDomainEventBus,
            },
        ],
    })
], AppModule);
