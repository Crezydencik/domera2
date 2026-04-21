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
exports.InvitationsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const current_user_decorator_1 = require("../../common/auth/current-user.decorator");
const firebase_auth_guard_1 = require("../../common/auth/firebase-auth.guard");
const roles_decorator_1 = require("../../common/auth/roles.decorator");
const roles_guard_1 = require("../../common/auth/roles.guard");
const invitations_service_1 = require("./invitations.service");
const accept_invitation_dto_1 = require("./dto/accept-invitation.dto");
const invitation_response_dto_1 = require("./dto/invitation-response.dto");
const resolve_invitation_dto_1 = require("./dto/resolve-invitation.dto");
const send_invitation_dto_1 = require("./dto/send-invitation.dto");
let InvitationsController = class InvitationsController {
    constructor(invitationsService) {
        this.invitationsService = invitationsService;
    }
    list(request, user, companyId) {
        return this.invitationsService.listByCompany(request, user, companyId);
    }
    byEmail(request, user, email) {
        return this.invitationsService.findByEmail(request, user, email);
    }
    send(request, user, body) {
        return this.invitationsService.send(request, user, body);
    }
    resolve(request, query) {
        return this.invitationsService.resolve(request, query.token);
    }
    accept(request, user, body) {
        return this.invitationsService.accept(request, user, body);
    }
    revoke(request, user, invitationId) {
        return this.invitationsService.revoke(request, user, invitationId);
    }
};
exports.InvitationsController = InvitationsController;
__decorate([
    (0, common_1.Get)(),
    (0, common_1.UseGuards)(firebase_auth_guard_1.FirebaseAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('ManagementCompany', 'Accountant'),
    (0, swagger_1.ApiOperation)({ summary: 'List invitations by company' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiCookieAuth)('__session'),
    (0, swagger_1.ApiQuery)({ name: 'companyId', required: true, type: String }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Query)('companyId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String]),
    __metadata("design:returntype", void 0)
], InvitationsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('by-email'),
    (0, common_1.UseGuards)(firebase_auth_guard_1.FirebaseAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('ManagementCompany', 'Accountant', 'Resident'),
    (0, swagger_1.ApiOperation)({ summary: 'Find invitation by email' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiCookieAuth)('__session'),
    (0, swagger_1.ApiQuery)({ name: 'email', required: true, type: String }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Query)('email')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String]),
    __metadata("design:returntype", void 0)
], InvitationsController.prototype, "byEmail", null);
__decorate([
    (0, common_1.Post)('send'),
    (0, common_1.UseGuards)(firebase_auth_guard_1.FirebaseAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('ManagementCompany', 'Accountant', 'Resident'),
    (0, swagger_1.ApiOperation)({ summary: 'Send a resident invitation' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiCookieAuth)('__session'),
    (0, swagger_1.ApiBody)({ type: send_invitation_dto_1.SendInvitationDto }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Invitation created and prepared for delivery.',
        type: invitation_response_dto_1.SendInvitationResponseDto,
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, send_invitation_dto_1.SendInvitationDto]),
    __metadata("design:returntype", void 0)
], InvitationsController.prototype, "send", null);
__decorate([
    (0, common_1.Get)('resolve'),
    (0, swagger_1.ApiOperation)({ summary: 'Resolve invitation by token' }),
    (0, swagger_1.ApiQuery)({ name: 'token', required: true, type: String }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Invitation resolved successfully.',
        type: invitation_response_dto_1.ResolveInvitationResponseDto,
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, resolve_invitation_dto_1.ResolveInvitationDto]),
    __metadata("design:returntype", void 0)
], InvitationsController.prototype, "resolve", null);
__decorate([
    (0, common_1.Post)('accept'),
    (0, swagger_1.ApiOperation)({ summary: 'Accept invitation as existing user or during registration' }),
    (0, swagger_1.ApiBody)({ type: accept_invitation_dto_1.AcceptInvitationDto }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Invitation accepted.',
        type: invitation_response_dto_1.AcceptInvitationResponseDto,
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, accept_invitation_dto_1.AcceptInvitationDto]),
    __metadata("design:returntype", void 0)
], InvitationsController.prototype, "accept", null);
__decorate([
    (0, common_1.Patch)(':invitationId/revoke'),
    (0, common_1.UseGuards)(firebase_auth_guard_1.FirebaseAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('ManagementCompany', 'Accountant'),
    (0, swagger_1.ApiOperation)({ summary: 'Revoke invitation' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiCookieAuth)('__session'),
    (0, swagger_1.ApiParam)({ name: 'invitationId', required: true, type: String }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Param)('invitationId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String]),
    __metadata("design:returntype", void 0)
], InvitationsController.prototype, "revoke", null);
exports.InvitationsController = InvitationsController = __decorate([
    (0, swagger_1.ApiTags)('Invitations'),
    (0, common_1.Controller)('invitations'),
    __metadata("design:paramtypes", [invitations_service_1.InvitationsService])
], InvitationsController);
