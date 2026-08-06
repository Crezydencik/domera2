"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApartmentsModule = void 0;
const common_1 = require("@nestjs/common");
const apartments_service_1 = require("./apartments.service");
const email_module_1 = require("../emails/email.module");
const apartment_admin_controller_1 = require("./controllers/apartment-admin.controller");
const apartment_import_controller_1 = require("./controllers/apartment-import.controller");
const apartment_owner_controller_1 = require("./controllers/apartment-owner.controller");
const apartment_tenant_controller_1 = require("./controllers/apartment-tenant.controller");
const apartments_crud_controller_1 = require("./controllers/apartments-crud.controller");
const apartments_repository_1 = require("./repositories/apartments.repository");
const apartment_access_service_1 = require("./services/apartment-access.service");
const apartment_code_service_1 = require("./services/apartment-code.service");
const apartment_invitation_service_1 = require("./services/apartment-invitation.service");
const apartment_meter_service_1 = require("./services/apartment-meter.service");
const apartment_storage_service_1 = require("./services/apartment-storage.service");
let ApartmentsModule = class ApartmentsModule {
};
exports.ApartmentsModule = ApartmentsModule;
exports.ApartmentsModule = ApartmentsModule = __decorate([
    (0, common_1.Module)({
        imports: [email_module_1.EmailModule],
        controllers: [
            apartments_crud_controller_1.ApartmentsCrudController,
            apartment_owner_controller_1.ApartmentOwnerController,
            apartment_tenant_controller_1.ApartmentTenantController,
            apartment_import_controller_1.ApartmentImportController,
            apartment_admin_controller_1.ApartmentAdminController,
        ],
        providers: [
            apartments_service_1.ApartmentsService,
            apartments_repository_1.ApartmentsRepository,
            apartment_access_service_1.ApartmentAccessService,
            apartment_code_service_1.ApartmentCodeService,
            apartment_invitation_service_1.ApartmentInvitationService,
            apartment_meter_service_1.ApartmentMeterService,
            apartment_storage_service_1.ApartmentStorageService,
        ],
    })
], ApartmentsModule);
