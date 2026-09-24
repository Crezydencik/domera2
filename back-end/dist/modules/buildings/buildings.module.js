"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BuildingsModule = void 0;
const common_1 = require("@nestjs/common");
const building_creation_access_controller_1 = require("./controllers/building-creation-access.controller");
const buildings_admin_controller_1 = require("./controllers/buildings-admin.controller");
const buildings_crud_controller_1 = require("./controllers/buildings-crud.controller");
const buildings_service_1 = require("./buildings.service");
const building_admin_service_1 = require("./services/building-admin.service");
const building_creation_request_service_1 = require("./services/building-creation-request.service");
const building_crud_service_1 = require("./services/building-crud.service");
const building_payload_service_1 = require("./services/building-payload.service");
const building_platform_billing_service_1 = require("./services/building-platform-billing.service");
const building_platform_notification_service_1 = require("./services/building-platform-notification.service");
const building_stats_service_1 = require("./services/building-stats.service");
const building_storage_service_1 = require("./services/building-storage.service");
const company_payload_service_1 = require("../company/services/company-payload.service");
let BuildingsModule = class BuildingsModule {
};
exports.BuildingsModule = BuildingsModule;
exports.BuildingsModule = BuildingsModule = __decorate([
    (0, common_1.Module)({
        controllers: [
            building_creation_access_controller_1.BuildingCreationAccessController,
            buildings_admin_controller_1.BuildingsAdminController,
            buildings_crud_controller_1.BuildingsCrudController,
        ],
        providers: [
            buildings_service_1.BuildingsService,
            building_admin_service_1.BuildingAdminService,
            building_creation_request_service_1.BuildingCreationRequestService,
            building_crud_service_1.BuildingCrudService,
            building_payload_service_1.BuildingPayloadService,
            building_platform_billing_service_1.BuildingPlatformBillingService,
            building_platform_notification_service_1.BuildingPlatformNotificationService,
            building_stats_service_1.BuildingStatsService,
            building_storage_service_1.BuildingStorageService,
            company_payload_service_1.CompanyPayloadService,
        ],
        exports: [buildings_service_1.BuildingsService],
    })
], BuildingsModule);
