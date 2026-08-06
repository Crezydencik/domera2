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
exports.ApartmentsCrudController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const current_user_decorator_1 = require("../../../common/auth/current-user.decorator");
const firebase_auth_guard_1 = require("../../../common/auth/firebase-auth.guard");
const roles_decorator_1 = require("../../../common/auth/roles.decorator");
const roles_guard_1 = require("../../../common/auth/roles.guard");
const role_constants_1 = require("../../../common/auth/role.constants");
const apartments_service_1 = require("../apartments.service");
const create_apartment_dto_1 = require("../dto/create-apartment.dto");
let ApartmentsCrudController = class ApartmentsCrudController {
    constructor(apartmentsService) {
        this.apartmentsService = apartmentsService;
    }
    list(request, user, query) {
        return this.apartmentsService.list(request, user, query);
    }
    byId(request, user, apartmentId) {
        return this.apartmentsService.byId(request, user, apartmentId);
    }
    create(request, user, body) {
        return this.apartmentsService.create(request, user, body);
    }
    update(request, user, apartmentId, body) {
        return this.apartmentsService.update(request, user, apartmentId, body);
    }
    storageSummary(request, user, apartmentId) {
        return this.apartmentsService.storageSummary(request, user, apartmentId);
    }
    remove(request, user, apartmentId) {
        return this.apartmentsService.remove(request, user, apartmentId);
    }
};
exports.ApartmentsCrudController = ApartmentsCrudController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'List apartments by company/building/resident' }),
    (0, swagger_1.ApiQuery)({ name: 'companyId', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'buildingId', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'residentId', required: false, type: String }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], ApartmentsCrudController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':apartmentId'),
    (0, swagger_1.ApiOperation)({ summary: 'Get apartment by id' }),
    (0, swagger_1.ApiParam)({ name: 'apartmentId', required: true, type: String }),
    (0, roles_decorator_1.Roles)(...role_constants_1.STAFF_ROLES, ...role_constants_1.PROPERTY_MEMBER_ROLES),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Param)('apartmentId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String]),
    __metadata("design:returntype", void 0)
], ApartmentsCrudController.prototype, "byId", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create apartment' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, create_apartment_dto_1.CreateApartmentDto]),
    __metadata("design:returntype", void 0)
], ApartmentsCrudController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':apartmentId'),
    (0, swagger_1.ApiOperation)({ summary: 'Update apartment' }),
    (0, swagger_1.ApiParam)({ name: 'apartmentId', required: true, type: String }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Param)('apartmentId')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, create_apartment_dto_1.UpdateApartmentDto]),
    __metadata("design:returntype", void 0)
], ApartmentsCrudController.prototype, "update", null);
__decorate([
    (0, common_1.Get)(':apartmentId/storage-summary'),
    (0, swagger_1.ApiOperation)({ summary: 'Get apartment storage summary before deletion' }),
    (0, swagger_1.ApiParam)({ name: 'apartmentId', required: true, type: String }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Param)('apartmentId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String]),
    __metadata("design:returntype", void 0)
], ApartmentsCrudController.prototype, "storageSummary", null);
__decorate([
    (0, common_1.Delete)(':apartmentId'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete apartment' }),
    (0, swagger_1.ApiParam)({ name: 'apartmentId', required: true, type: String }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Param)('apartmentId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String]),
    __metadata("design:returntype", void 0)
], ApartmentsCrudController.prototype, "remove", null);
exports.ApartmentsCrudController = ApartmentsCrudController = __decorate([
    (0, swagger_1.ApiTags)('Apartments'),
    (0, common_1.Controller)('apartments'),
    (0, common_1.UseGuards)(firebase_auth_guard_1.FirebaseAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('ManagementCompany', 'Accountant'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiCookieAuth)('__session'),
    __metadata("design:paramtypes", [apartments_service_1.ApartmentsService])
], ApartmentsCrudController);
