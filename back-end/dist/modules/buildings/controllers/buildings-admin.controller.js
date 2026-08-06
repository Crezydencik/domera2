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
exports.BuildingsAdminController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const current_user_decorator_1 = require("../../../common/auth/current-user.decorator");
const firebase_auth_guard_1 = require("../../../common/auth/firebase-auth.guard");
const roles_decorator_1 = require("../../../common/auth/roles.decorator");
const roles_guard_1 = require("../../../common/auth/roles.guard");
const building_admin_service_1 = require("../services/building-admin.service");
let BuildingsAdminController = class BuildingsAdminController {
    constructor(buildingAdminService) {
        this.buildingAdminService = buildingAdminService;
    }
    listAllForAdmin(request, user) {
        return this.buildingAdminService.listAllForAdmin(request, user);
    }
    listPlatformBillingInvoices(request, user) {
        return this.buildingAdminService.listPlatformBillingInvoices(request, user);
    }
    setEditLock(request, user, buildingId, body) {
        return this.buildingAdminService.setEditLock(request, user, buildingId, body);
    }
};
exports.BuildingsAdminController = BuildingsAdminController;
__decorate([
    (0, common_1.Get)('admin/all'),
    (0, swagger_1.ApiOperation)({ summary: 'List all buildings for platform administrators' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], BuildingsAdminController.prototype, "listAllForAdmin", null);
__decorate([
    (0, common_1.Get)('admin/billing-invoices'),
    (0, swagger_1.ApiOperation)({ summary: 'List platform billing invoices' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], BuildingsAdminController.prototype, "listPlatformBillingInvoices", null);
__decorate([
    (0, common_1.Patch)('admin/:buildingId/edit-lock'),
    (0, swagger_1.ApiOperation)({ summary: 'Lock or unlock building editing' }),
    (0, swagger_1.ApiParam)({ name: 'buildingId', required: true, type: String }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Param)('buildingId')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, Object]),
    __metadata("design:returntype", void 0)
], BuildingsAdminController.prototype, "setEditLock", null);
exports.BuildingsAdminController = BuildingsAdminController = __decorate([
    (0, swagger_1.ApiTags)('Buildings'),
    (0, common_1.Controller)('buildings'),
    (0, common_1.UseGuards)(firebase_auth_guard_1.FirebaseAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('PlatformAdmin'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiCookieAuth)('__session'),
    __metadata("design:paramtypes", [building_admin_service_1.BuildingAdminService])
], BuildingsAdminController);
