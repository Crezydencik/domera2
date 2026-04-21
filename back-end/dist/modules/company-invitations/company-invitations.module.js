"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompanyInvitationsModule = void 0;
const common_1 = require("@nestjs/common");
const company_invitations_controller_1 = require("./company-invitations.controller");
const company_invitations_service_1 = require("./company-invitations.service");
let CompanyInvitationsModule = class CompanyInvitationsModule {
};
exports.CompanyInvitationsModule = CompanyInvitationsModule;
exports.CompanyInvitationsModule = CompanyInvitationsModule = __decorate([
    (0, common_1.Module)({
        controllers: [company_invitations_controller_1.CompanyInvitationsController],
        providers: [company_invitations_service_1.CompanyInvitationsService],
    })
], CompanyInvitationsModule);
