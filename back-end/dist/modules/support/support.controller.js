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
exports.SupportController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const current_user_decorator_1 = require("../../common/auth/current-user.decorator");
const firebase_auth_guard_1 = require("../../common/auth/firebase-auth.guard");
const roles_decorator_1 = require("../../common/auth/roles.decorator");
const roles_guard_1 = require("../../common/auth/roles.guard");
const add_support_message_dto_1 = require("./dto/add-support-message.dto");
const create_support_feedback_dto_1 = require("./dto/create-support-feedback.dto");
const support_service_1 = require("./support.service");
let SupportController = class SupportController {
    constructor(supportService) {
        this.supportService = supportService;
    }
    listFeedback(user, status) {
        return this.supportService.listFeedback(user, status);
    }
    listOwnFeedback(user) {
        return this.supportService.listOwnFeedback(user);
    }
    createFeedback(user, body) {
        return this.supportService.createFeedback(user, body);
    }
    addMessage(user, feedbackId, body) {
        return this.supportService.addMessage(user, feedbackId, body);
    }
    completeFeedback(user, feedbackId) {
        return this.supportService.completeFeedback(user, feedbackId);
    }
};
exports.SupportController = SupportController;
__decorate([
    (0, common_1.Get)('feedback'),
    (0, roles_decorator_1.Roles)('PlatformAdmin'),
    (0, swagger_1.ApiOperation)({ summary: 'List support feedback requests for platform admin inbox' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], SupportController.prototype, "listFeedback", null);
__decorate([
    (0, common_1.Get)('feedback/mine'),
    (0, roles_decorator_1.Roles)('ManagementCompany', 'Accountant'),
    (0, swagger_1.ApiOperation)({ summary: 'List current management company support requests' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], SupportController.prototype, "listOwnFeedback", null);
__decorate([
    (0, common_1.Post)('feedback'),
    (0, roles_decorator_1.Roles)('ManagementCompany', 'Accountant'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: 'Create support feedback request' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_support_feedback_dto_1.CreateSupportFeedbackDto]),
    __metadata("design:returntype", void 0)
], SupportController.prototype, "createFeedback", null);
__decorate([
    (0, common_1.Post)('feedback/:feedbackId/messages'),
    (0, roles_decorator_1.Roles)('PlatformAdmin', 'ManagementCompany', 'Accountant'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: 'Add message to support request conversation' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('feedbackId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, add_support_message_dto_1.AddSupportMessageDto]),
    __metadata("design:returntype", void 0)
], SupportController.prototype, "addMessage", null);
__decorate([
    (0, common_1.Patch)('feedback/:feedbackId/complete'),
    (0, roles_decorator_1.Roles)('PlatformAdmin'),
    (0, swagger_1.ApiOperation)({ summary: 'Complete support request and move it to archive' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('feedbackId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], SupportController.prototype, "completeFeedback", null);
exports.SupportController = SupportController = __decorate([
    (0, swagger_1.ApiTags)('Support'),
    (0, common_1.Controller)('support'),
    (0, common_1.UseGuards)(firebase_auth_guard_1.FirebaseAuthGuard, roles_guard_1.RolesGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiCookieAuth)('__session'),
    __metadata("design:paramtypes", [support_service_1.SupportService])
], SupportController);
