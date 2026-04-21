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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompanyInvitationsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const current_user_decorator_1 = require("../../common/auth/current-user.decorator");
const firebase_auth_guard_1 = require("../../common/auth/firebase-auth.guard");
const roles_decorator_1 = require("../../common/auth/roles.decorator");
const roles_guard_1 = require("../../common/auth/roles.guard");
const company_invitations_service_1 = require("./company-invitations.service");
const accept_company_invitation_dto_1 = require("./dto/accept-company-invitation.dto");
const company_invitation_response_dto_1 = require("./dto/company-invitation-response.dto");
const list_company_invitations_dto_1 = require("./dto/list-company-invitations.dto");
const send_company_invitation_dto_1 = require("./dto/send-company-invitation.dto");
let CompanyInvitationsController = class CompanyInvitationsController {
    constructor(service) {
        this.service = service;
    }
    list(request, user, query) {
        return this.service.list(request, user, query.companyId, query.buildingId);
    }
    send(request, user, body) {
        return this.service.send(request, user, body);
    }
    accept(request, user, body) {
        return this.service.accept(request, user, body);
    }
};
exports.CompanyInvitationsController = CompanyInvitationsController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'List company invitations for a building' }),
    (0, swagger_1.ApiQuery)({ name: 'companyId', required: true, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'buildingId', required: true, type: String }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Invitation list returned.',
        type: company_invitation_response_dto_1.CompanyInvitationListResponseDto,
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, list_company_invitations_dto_1.ListCompanyInvitationsDto]),
    __metadata("design:returntype", void 0)
], CompanyInvitationsController.prototype, "list", null);
__decorate([
    (0, common_1.Post)('send'),
    (0, swagger_1.ApiOperation)({ summary: 'Send a company invitation' }),
    (0, swagger_1.ApiBody)({ type: send_company_invitation_dto_1.SendCompanyInvitationDto }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Company invitation created successfully.',
        type: company_invitation_response_dto_1.CompanyInvitationMutationResponseDto,
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, send_company_invitation_dto_1.SendCompanyInvitationDto]),
    __metadata("design:returntype", void 0)
], CompanyInvitationsController.prototype, "send", null);
__decorate([
    (0, common_1.Post)('accept'),
    (0, swagger_1.ApiOperation)({ summary: 'Accept a company invitation' }),
    (0, swagger_1.ApiBody)({ type: accept_company_invitation_dto_1.AcceptCompanyInvitationDto }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Company invitation accepted.',
        type: company_invitation_response_dto_1.CompanyInvitationMutationResponseDto,
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, accept_company_invitation_dto_1.AcceptCompanyInvitationDto]),
    __metadata("design:returntype", void 0)
], CompanyInvitationsController.prototype, "accept", null);
exports.CompanyInvitationsController = CompanyInvitationsController = __decorate([
    (0, swagger_1.ApiTags)('Company Invitations'),
    (0, common_1.Controller)('company-invitations'),
    (0, common_1.UseGuards)(firebase_auth_guard_1.FirebaseAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('ManagementCompany', 'Accountant'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiCookieAuth)('__session'),
    __metadata("design:paramtypes", [company_invitations_service_1.CompanyInvitationsService])
], CompanyInvitationsController);
