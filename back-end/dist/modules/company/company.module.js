"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompanyModule = void 0;
const common_1 = require("@nestjs/common");
const email_module_1 = require("../emails/email.module");
const company_controller_1 = require("./company.controller");
const company_access_service_1 = require("./services/company-access.service");
const company_api_key_service_1 = require("./services/company-api-key.service");
const company_crud_service_1 = require("./services/company-crud.service");
const company_member_service_1 = require("./services/company-member.service");
const company_payload_service_1 = require("./services/company-payload.service");
const company_service_1 = require("./services/company.service");
const company_storage_service_1 = require("./services/company-storage.service");
const company_invitations_controller_1 = require("./invitations/company-invitations.controller");
const company_invitations_service_1 = require("./invitations/services/company-invitations.service");
let CompanyModule = class CompanyModule {
};
exports.CompanyModule = CompanyModule;
exports.CompanyModule = CompanyModule = __decorate([
    (0, common_1.Module)({
        imports: [email_module_1.EmailModule],
        controllers: [company_controller_1.CompanyController, company_invitations_controller_1.CompanyInvitationsController],
        providers: [
            company_service_1.CompanyService,
            company_access_service_1.CompanyAccessService,
            company_payload_service_1.CompanyPayloadService,
            company_storage_service_1.CompanyStorageService,
            company_crud_service_1.CompanyCrudService,
            company_api_key_service_1.CompanyApiKeyService,
            company_member_service_1.CompanyMemberService,
            company_invitations_service_1.CompanyInvitationsService,
        ],
    })
], CompanyModule);
