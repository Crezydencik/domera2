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
exports.BuildingCreationAccessController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const current_user_decorator_1 = require("../../../common/auth/current-user.decorator");
const firebase_auth_guard_1 = require("../../../common/auth/firebase-auth.guard");
const roles_decorator_1 = require("../../../common/auth/roles.decorator");
const roles_guard_1 = require("../../../common/auth/roles.guard");
const building_creation_request_service_1 = require("../services/building-creation-request.service");
let BuildingCreationAccessController = class BuildingCreationAccessController {
    constructor(creationRequestService) {
        this.creationRequestService = creationRequestService;
    }
    creationAccess(request, user, companyId) {
        return this.creationRequestService.getCreationAccess(request, user, companyId);
    }
    requestCreationAccess(request, user, body) {
        return this.creationRequestService.requestCreationAccess(request, user, body);
    }
    cancelCreationAccessRequest(request, user, requestId) {
        return this.creationRequestService.cancelCreationAccessRequest(request, user, requestId);
    }
};
exports.BuildingCreationAccessController = BuildingCreationAccessController;
__decorate([
    (0, common_1.Get)('creation-access'),
    (0, swagger_1.ApiOperation)({ summary: 'Check whether the company can create a building' }),
    (0, swagger_1.ApiQuery)({ name: 'companyId', required: true, type: String }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Query)('companyId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String]),
    __metadata("design:returntype", void 0)
], BuildingCreationAccessController.prototype, "creationAccess", null);
__decorate([
    (0, common_1.Post)('creation-access/request'),
    (0, swagger_1.ApiOperation)({ summary: 'Request building creation access from platform administrators' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], BuildingCreationAccessController.prototype, "requestCreationAccess", null);
__decorate([
    (0, common_1.Delete)('creation-access/request/:requestId'),
    (0, swagger_1.ApiOperation)({ summary: 'Cancel a pending building creation request' }),
    (0, swagger_1.ApiParam)({ name: 'requestId', required: true, type: String }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Param)('requestId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String]),
    __metadata("design:returntype", void 0)
], BuildingCreationAccessController.prototype, "cancelCreationAccessRequest", null);
exports.BuildingCreationAccessController = BuildingCreationAccessController = __decorate([
    (0, swagger_1.ApiTags)('Buildings'),
    (0, common_1.Controller)('buildings'),
    (0, common_1.UseGuards)(firebase_auth_guard_1.FirebaseAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('ManagementCompany', 'Accountant'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiCookieAuth)('__session'),
    __metadata("design:paramtypes", [building_creation_request_service_1.BuildingCreationRequestService])
], BuildingCreationAccessController);
