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
exports.ApartmentAdminController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const current_user_decorator_1 = require("../../../common/auth/current-user.decorator");
const firebase_auth_guard_1 = require("../../../common/auth/firebase-auth.guard");
const roles_decorator_1 = require("../../../common/auth/roles.decorator");
const roles_guard_1 = require("../../../common/auth/roles.guard");
const apartments_service_1 = require("../apartments.service");
let ApartmentAdminController = class ApartmentAdminController {
    constructor(apartmentsService) {
        this.apartmentsService = apartmentsService;
    }
    auditLogs(request, user, apartmentId, limit) {
        return this.apartmentsService.getAuditLogs(request, user, apartmentId, limit ? parseInt(limit, 10) : 50);
    }
    migrateReadableIds(user) {
        if (user.role !== 'ManagementCompany') {
            throw new common_1.ForbiddenException('Only management company users can run migration');
        }
        return this.apartmentsService.migrateApartmentReadableIds();
    }
};
exports.ApartmentAdminController = ApartmentAdminController;
__decorate([
    (0, common_1.Get)(':apartmentId/audit-logs'),
    (0, roles_decorator_1.Roles)('ManagementCompany'),
    (0, swagger_1.ApiOperation)({ summary: 'Get audit logs for apartment' }),
    (0, swagger_1.ApiParam)({ name: 'apartmentId', required: true, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Param)('apartmentId')),
    __param(3, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, String]),
    __metadata("design:returntype", void 0)
], ApartmentAdminController.prototype, "auditLogs", null);
__decorate([
    (0, common_1.Post)('migrate/readable-ids'),
    (0, swagger_1.ApiOperation)({ summary: 'Migrate apartments by generating readable IDs (admin only)' }),
    (0, roles_decorator_1.Roles)('ManagementCompany'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ApartmentAdminController.prototype, "migrateReadableIds", null);
exports.ApartmentAdminController = ApartmentAdminController = __decorate([
    (0, swagger_1.ApiTags)('Apartments'),
    (0, common_1.Controller)('apartments'),
    (0, common_1.UseGuards)(firebase_auth_guard_1.FirebaseAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('ManagementCompany', 'Accountant'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiCookieAuth)('__session'),
    __metadata("design:paramtypes", [apartments_service_1.ApartmentsService])
], ApartmentAdminController);
