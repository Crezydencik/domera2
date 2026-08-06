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
exports.ApartmentOwnerController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const current_user_decorator_1 = require("../../../common/auth/current-user.decorator");
const firebase_auth_guard_1 = require("../../../common/auth/firebase-auth.guard");
const roles_decorator_1 = require("../../../common/auth/roles.decorator");
const roles_guard_1 = require("../../../common/auth/roles.guard");
const role_constants_1 = require("../../../common/auth/role.constants");
const apartments_service_1 = require("../apartments.service");
const invite_owner_dto_1 = require("../dto/invite-owner.dto");
let ApartmentOwnerController = class ApartmentOwnerController {
    constructor(apartmentsService) {
        this.apartmentsService = apartmentsService;
    }
    updateOwner(request, user, apartmentId, body) {
        if (!body?.email)
            throw new common_1.BadRequestException('email is required');
        return this.apartmentsService.updateOwner(request, user, apartmentId, body.email, {
            firstName: body.firstName,
            lastName: body.lastName,
            contractNumber: body.contractNumber,
        });
    }
    removeOwner(request, user, apartmentId) {
        return this.apartmentsService.removeOwner(request, user, apartmentId);
    }
    resendOwnerInvitation(request, user, apartmentId, ownerEmail) {
        return this.apartmentsService.resendOwnerInvitation(request, user, apartmentId, decodeURIComponent(ownerEmail));
    }
};
exports.ApartmentOwnerController = ApartmentOwnerController;
__decorate([
    (0, common_1.Patch)(':apartmentId/owner'),
    (0, swagger_1.ApiOperation)({ summary: 'Update apartment owner' }),
    (0, swagger_1.ApiParam)({ name: 'apartmentId', required: true, type: String }),
    (0, roles_decorator_1.Roles)(...role_constants_1.STAFF_ROLES, 'Landlord'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Param)('apartmentId')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, invite_owner_dto_1.InviteOwnerDto]),
    __metadata("design:returntype", void 0)
], ApartmentOwnerController.prototype, "updateOwner", null);
__decorate([
    (0, common_1.Delete)(':apartmentId/owner'),
    (0, swagger_1.ApiOperation)({ summary: 'Remove apartment owner' }),
    (0, swagger_1.ApiParam)({ name: 'apartmentId', required: true, type: String }),
    (0, roles_decorator_1.Roles)(...role_constants_1.STAFF_ROLES, 'Landlord'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Param)('apartmentId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String]),
    __metadata("design:returntype", void 0)
], ApartmentOwnerController.prototype, "removeOwner", null);
__decorate([
    (0, common_1.Post)(':apartmentId/owner/:ownerEmail/resend-invitation'),
    (0, swagger_1.ApiOperation)({ summary: 'Resend invitation to owner' }),
    (0, swagger_1.ApiParam)({ name: 'apartmentId', required: true, type: String }),
    (0, swagger_1.ApiParam)({ name: 'ownerEmail', required: true, type: String }),
    (0, roles_decorator_1.Roles)(...role_constants_1.STAFF_ROLES, 'Landlord'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Param)('apartmentId')),
    __param(3, (0, common_1.Param)('ownerEmail')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, String]),
    __metadata("design:returntype", void 0)
], ApartmentOwnerController.prototype, "resendOwnerInvitation", null);
exports.ApartmentOwnerController = ApartmentOwnerController = __decorate([
    (0, swagger_1.ApiTags)('Apartments'),
    (0, common_1.Controller)('apartments'),
    (0, common_1.UseGuards)(firebase_auth_guard_1.FirebaseAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('ManagementCompany', 'Accountant'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiCookieAuth)('__session'),
    __metadata("design:paramtypes", [apartments_service_1.ApartmentsService])
], ApartmentOwnerController);
