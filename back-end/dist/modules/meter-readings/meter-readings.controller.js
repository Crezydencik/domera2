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
exports.MeterReadingsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const current_user_decorator_1 = require("../../common/auth/current-user.decorator");
const firebase_auth_guard_1 = require("../../common/auth/firebase-auth.guard");
const role_constants_1 = require("../../common/auth/role.constants");
const roles_decorator_1 = require("../../common/auth/roles.decorator");
const roles_guard_1 = require("../../common/auth/roles.guard");
const meter_readings_service_1 = require("./meter-readings.service");
const create_meter_reading_dto_1 = require("./dto/create-meter-reading.dto");
const meter_reading_response_dto_1 = require("./dto/meter-reading-response.dto");
const update_meter_reading_dto_1 = require("./dto/update-meter-reading.dto");
const success_response_dto_1 = require("../../common/dto/success-response.dto");
let MeterReadingsController = class MeterReadingsController {
    constructor(meterReadingsService) {
        this.meterReadingsService = meterReadingsService;
    }
    list(user, apartmentId, companyId) {
        return this.meterReadingsService.list(user, apartmentId, companyId);
    }
    create(request, user, body) {
        return this.meterReadingsService.create(request, user, body);
    }
    update(request, user, readingId, body) {
        return this.meterReadingsService.update(request, user, readingId, body.apartmentId, body.data);
    }
    remove(request, user, readingId, apartmentId) {
        if (!apartmentId)
            throw new common_1.BadRequestException('apartmentId is required');
        return this.meterReadingsService.remove(request, user, readingId, apartmentId);
    }
};
exports.MeterReadingsController = MeterReadingsController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'List meter readings for an apartment or company' }),
    (0, swagger_1.ApiQuery)({ name: 'apartmentId', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'companyId', required: false, type: String }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Meter readings returned.',
        type: meter_reading_response_dto_1.MeterReadingListResponseDto,
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('apartmentId')),
    __param(2, (0, common_1.Query)('companyId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], MeterReadingsController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create meter reading entry' }),
    (0, swagger_1.ApiBody)({ type: create_meter_reading_dto_1.CreateMeterReadingDto }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Meter reading created successfully.',
        type: meter_reading_response_dto_1.MeterReadingCreateResponseDto,
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, create_meter_reading_dto_1.CreateMeterReadingDto]),
    __metadata("design:returntype", void 0)
], MeterReadingsController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':readingId'),
    (0, swagger_1.ApiOperation)({ summary: 'Update meter reading entry' }),
    (0, swagger_1.ApiParam)({ name: 'readingId', type: String }),
    (0, swagger_1.ApiBody)({ type: update_meter_reading_dto_1.UpdateMeterReadingDto }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Meter reading updated successfully.',
        type: success_response_dto_1.SuccessResponseDto,
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Param)('readingId')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, update_meter_reading_dto_1.UpdateMeterReadingDto]),
    __metadata("design:returntype", void 0)
], MeterReadingsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':readingId'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete meter reading entry for current month' }),
    (0, swagger_1.ApiParam)({ name: 'readingId', type: String }),
    (0, swagger_1.ApiQuery)({ name: 'apartmentId', required: true, type: String }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Meter reading deleted successfully.',
        type: success_response_dto_1.SuccessResponseDto,
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Param)('readingId')),
    __param(3, (0, common_1.Query)('apartmentId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, String]),
    __metadata("design:returntype", void 0)
], MeterReadingsController.prototype, "remove", null);
exports.MeterReadingsController = MeterReadingsController = __decorate([
    (0, swagger_1.ApiTags)('Meter Readings'),
    (0, common_1.Controller)('meter-readings'),
    (0, common_1.UseGuards)(firebase_auth_guard_1.FirebaseAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(...role_constants_1.PROPERTY_MEMBER_ROLES, ...role_constants_1.STAFF_ROLES),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiCookieAuth)('__session'),
    __metadata("design:paramtypes", [meter_readings_service_1.MeterReadingsService])
], MeterReadingsController);
