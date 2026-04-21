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
exports.ResidentController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const current_user_decorator_1 = require("../../common/auth/current-user.decorator");
const firebase_auth_guard_1 = require("../../common/auth/firebase-auth.guard");
const role_constants_1 = require("../../common/auth/role.constants");
const roles_decorator_1 = require("../../common/auth/roles.decorator");
const roles_guard_1 = require("../../common/auth/roles.guard");
const resident_service_1 = require("./resident.service");
const resident_response_dto_1 = require("./dto/resident-response.dto");
let ResidentController = class ResidentController {
    constructor(residentService) {
        this.residentService = residentService;
    }
    apartments(user) {
        return this.residentService.apartments(user);
    }
};
exports.ResidentController = ResidentController;
__decorate([
    (0, common_1.Get)('apartments'),
    (0, swagger_1.ApiOperation)({ summary: 'Get resident apartments and related buildings' }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Resident apartments returned successfully.',
        type: resident_response_dto_1.ResidentApartmentsResponseDto,
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ResidentController.prototype, "apartments", null);
exports.ResidentController = ResidentController = __decorate([
    (0, swagger_1.ApiTags)('Resident'),
    (0, common_1.Controller)('resident'),
    (0, common_1.UseGuards)(firebase_auth_guard_1.FirebaseAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(...role_constants_1.PROPERTY_MEMBER_ROLES),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiCookieAuth)('__session'),
    __metadata("design:paramtypes", [resident_service_1.ResidentService])
], ResidentController);
