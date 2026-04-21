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
exports.ApartmentsController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const swagger_1 = require("@nestjs/swagger");
const current_user_decorator_1 = require("../../common/auth/current-user.decorator");
const firebase_auth_guard_1 = require("../../common/auth/firebase-auth.guard");
const roles_decorator_1 = require("../../common/auth/roles.decorator");
const roles_guard_1 = require("../../common/auth/roles.guard");
const apartments_service_1 = require("./apartments.service");
const import_apartments_dto_1 = require("./dto/import-apartments.dto");
const import_apartments_response_dto_1 = require("./dto/import-apartments-response.dto");
let ApartmentsController = class ApartmentsController {
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
    remove(request, user, apartmentId) {
        return this.apartmentsService.remove(request, user, apartmentId);
    }
    inviteTenant(request, user, apartmentId, body) {
        if (!body?.email)
            throw new common_1.BadRequestException('email is required');
        return this.apartmentsService.addOrInviteTenant(request, user, apartmentId, body.email);
    }
    removeTenant(request, user, apartmentId, tenantUserId) {
        return this.apartmentsService.removeTenant(request, user, apartmentId, tenantUserId);
    }
    unassignResident(request, user, apartmentId) {
        return this.apartmentsService.unassignResident(request, user, apartmentId);
    }
    importApartments(request, user, file, body) {
        if (!file) {
            throw new common_1.BadRequestException('File is required');
        }
        return this.apartmentsService.importFromSpreadsheet({
            request,
            user,
            file,
            buildingId: body.buildingId,
            companyId: body.companyId,
        });
    }
};
exports.ApartmentsController = ApartmentsController;
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
], ApartmentsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':apartmentId'),
    (0, swagger_1.ApiOperation)({ summary: 'Get apartment by id' }),
    (0, swagger_1.ApiParam)({ name: 'apartmentId', required: true, type: String }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Param)('apartmentId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String]),
    __metadata("design:returntype", void 0)
], ApartmentsController.prototype, "byId", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create apartment' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], ApartmentsController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':apartmentId'),
    (0, swagger_1.ApiOperation)({ summary: 'Update apartment' }),
    (0, swagger_1.ApiParam)({ name: 'apartmentId', required: true, type: String }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Param)('apartmentId')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, Object]),
    __metadata("design:returntype", void 0)
], ApartmentsController.prototype, "update", null);
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
], ApartmentsController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)(':apartmentId/tenants/invite'),
    (0, swagger_1.ApiOperation)({ summary: 'Add or invite tenant by email' }),
    (0, swagger_1.ApiParam)({ name: 'apartmentId', required: true, type: String }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Param)('apartmentId')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, Object]),
    __metadata("design:returntype", void 0)
], ApartmentsController.prototype, "inviteTenant", null);
__decorate([
    (0, common_1.Delete)(':apartmentId/tenants/:tenantUserId'),
    (0, swagger_1.ApiOperation)({ summary: 'Remove tenant from apartment' }),
    (0, swagger_1.ApiParam)({ name: 'apartmentId', required: true, type: String }),
    (0, swagger_1.ApiParam)({ name: 'tenantUserId', required: true, type: String }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Param)('apartmentId')),
    __param(3, (0, common_1.Param)('tenantUserId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, String]),
    __metadata("design:returntype", void 0)
], ApartmentsController.prototype, "removeTenant", null);
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
], ApartmentsController.prototype, "unassignResident", null);
__decorate([
    (0, common_1.Post)('import'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file')),
    (0, swagger_1.ApiOperation)({ summary: 'Import apartments from Excel file' }),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['file', 'buildingId', 'companyId'],
            properties: {
                file: {
                    type: 'string',
                    format: 'binary',
                },
                buildingId: { type: 'string' },
                companyId: { type: 'string' },
            },
        },
    }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Apartment import finished successfully.',
        type: import_apartments_response_dto_1.ImportApartmentsResponseDto,
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.UploadedFile)()),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, import_apartments_dto_1.ImportApartmentsDto]),
    __metadata("design:returntype", void 0)
], ApartmentsController.prototype, "importApartments", null);
exports.ApartmentsController = ApartmentsController = __decorate([
    (0, swagger_1.ApiTags)('Apartments'),
    (0, common_1.Controller)('apartments'),
    (0, common_1.UseGuards)(firebase_auth_guard_1.FirebaseAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('ManagementCompany', 'Accountant'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiCookieAuth)('__session'),
    __metadata("design:paramtypes", [apartments_service_1.ApartmentsService])
], ApartmentsController);
