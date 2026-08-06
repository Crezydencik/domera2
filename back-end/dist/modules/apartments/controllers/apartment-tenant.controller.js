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
exports.ApartmentTenantController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const current_user_decorator_1 = require("../../../common/auth/current-user.decorator");
const firebase_auth_guard_1 = require("../../../common/auth/firebase-auth.guard");
const roles_decorator_1 = require("../../../common/auth/roles.decorator");
const roles_guard_1 = require("../../../common/auth/roles.guard");
const role_constants_1 = require("../../../common/auth/role.constants");
const apartments_service_1 = require("../apartments.service");
const invite_tenant_dto_1 = require("../dto/invite-tenant.dto");
const update_tenant_dto_1 = require("../dto/update-tenant.dto");
let ApartmentTenantController = class ApartmentTenantController {
    constructor(apartmentsService) {
        this.apartmentsService = apartmentsService;
    }
    inviteTenant(request, user, apartmentId, body) {
        if (!body?.email)
            throw new common_1.BadRequestException('email is required');
        return this.apartmentsService.addOrInviteTenant(request, user, apartmentId, body.email, {
            firstName: body.firstName,
            lastName: body.lastName,
            phone: body.phone,
            contractNumber: body.contractNumber,
            fromDate: body.fromDate,
            until: body.until,
            canViewDocuments: body.canViewDocuments,
        });
    }
    removeTenant(request, user, apartmentId, tenantUserId) {
        return this.apartmentsService.removeTenant(request, user, apartmentId, tenantUserId);
    }
    updateTenant(request, user, apartmentId, tenantUserId, body) {
        return this.apartmentsService.updateTenant(request, user, apartmentId, tenantUserId, body);
    }
    resendTenantInvitation(request, user, apartmentId, tenantEmail) {
        return this.apartmentsService.resendTenantInvitation(request, user, apartmentId, decodeURIComponent(tenantEmail));
    }
    unassignResident(request, user, apartmentId) {
        return this.apartmentsService.unassignResident(request, user, apartmentId);
    }
};
exports.ApartmentTenantController = ApartmentTenantController;
__decorate([
    (0, common_1.Post)(':apartmentId/tenants/invite'),
    (0, swagger_1.ApiOperation)({ summary: 'Add or invite tenant by email' }),
    (0, swagger_1.ApiParam)({ name: 'apartmentId', required: true, type: String }),
    (0, roles_decorator_1.Roles)(...role_constants_1.STAFF_ROLES, 'Landlord'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Param)('apartmentId')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, invite_tenant_dto_1.InviteTenantDto]),
    __metadata("design:returntype", void 0)
], ApartmentTenantController.prototype, "inviteTenant", null);
__decorate([
    (0, common_1.Delete)(':apartmentId/tenants/:tenantUserId'),
    (0, swagger_1.ApiOperation)({ summary: 'Remove tenant from apartment' }),
    (0, swagger_1.ApiParam)({ name: 'apartmentId', required: true, type: String }),
    (0, swagger_1.ApiParam)({ name: 'tenantUserId', required: true, type: String }),
    (0, roles_decorator_1.Roles)(...role_constants_1.STAFF_ROLES, 'Landlord'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Param)('apartmentId')),
    __param(3, (0, common_1.Param)('tenantUserId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, String]),
    __metadata("design:returntype", void 0)
], ApartmentTenantController.prototype, "removeTenant", null);
__decorate([
    (0, common_1.Patch)(':apartmentId/tenants/:tenantUserId'),
    (0, swagger_1.ApiOperation)({ summary: 'Update tenant details' }),
    (0, swagger_1.ApiParam)({ name: 'apartmentId', required: true, type: String }),
    (0, swagger_1.ApiParam)({ name: 'tenantUserId', required: true, type: String }),
    (0, roles_decorator_1.Roles)(...role_constants_1.STAFF_ROLES, 'Landlord'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Param)('apartmentId')),
    __param(3, (0, common_1.Param)('tenantUserId')),
    __param(4, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, String, update_tenant_dto_1.UpdateTenantDto]),
    __metadata("design:returntype", void 0)
], ApartmentTenantController.prototype, "updateTenant", null);
__decorate([
    (0, common_1.Post)(':apartmentId/tenants/:tenantEmail/resend-invitation'),
    (0, swagger_1.ApiOperation)({ summary: 'Resend invitation to tenant' }),
    (0, swagger_1.ApiParam)({ name: 'apartmentId', required: true, type: String }),
    (0, swagger_1.ApiParam)({ name: 'tenantEmail', required: true, type: String }),
    (0, roles_decorator_1.Roles)(...role_constants_1.STAFF_ROLES, 'Landlord'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Param)('apartmentId')),
    __param(3, (0, common_1.Param)('tenantEmail')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, String]),
    __metadata("design:returntype", void 0)
], ApartmentTenantController.prototype, "resendTenantInvitation", null);
__decorate([
    (0, common_1.Post)(':apartmentId/unassign-resident'),
    (0, swagger_1.ApiOperation)({ summary: 'Unassign resident from apartment' }),
    (0, swagger_1.ApiParam)({ name: 'apartmentId', required: true, type: String }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Param)('apartmentId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String]),
    __metadata("design:returntype", void 0)
], ApartmentTenantController.prototype, "unassignResident", null);
exports.ApartmentTenantController = ApartmentTenantController = __decorate([
    (0, swagger_1.ApiTags)('Apartments'),
    (0, common_1.Controller)('apartments'),
    (0, common_1.UseGuards)(firebase_auth_guard_1.FirebaseAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('ManagementCompany', 'Accountant'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiCookieAuth)('__session'),
    __metadata("design:paramtypes", [apartments_service_1.ApartmentsService])
], ApartmentTenantController);
