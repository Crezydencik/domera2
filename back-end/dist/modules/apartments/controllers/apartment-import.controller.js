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
exports.ApartmentImportController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const swagger_1 = require("@nestjs/swagger");
const current_user_decorator_1 = require("../../../common/auth/current-user.decorator");
const firebase_auth_guard_1 = require("../../../common/auth/firebase-auth.guard");
const roles_decorator_1 = require("../../../common/auth/roles.decorator");
const roles_guard_1 = require("../../../common/auth/roles.guard");
const apartments_service_1 = require("../apartments.service");
const import_apartments_dto_1 = require("../dto/import-apartments.dto");
const import_apartments_response_dto_1 = require("../dto/import-apartments-response.dto");
const APARTMENT_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
const APARTMENT_IMPORT_EXTENSIONS = new Set(['.csv', '.json', '.xml', '.xlsx']);
const APARTMENT_IMPORT_MIME_TYPES = new Set([
    'text/csv',
    'text/plain',
    'application/csv',
    'application/json',
    'application/xml',
    'text/xml',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
function apartmentImportFileFilter(_request, file, callback) {
    const name = file.originalname?.toLowerCase() ?? '';
    const mimeType = file.mimetype?.toLowerCase() ?? '';
    const extension = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
    if (APARTMENT_IMPORT_EXTENSIONS.has(extension) || APARTMENT_IMPORT_MIME_TYPES.has(mimeType)) {
        callback(null, true);
        return;
    }
    callback(new common_1.BadRequestException('Only CSV, JSON, XML, and XLSX files are allowed'), false);
}
let ApartmentImportController = class ApartmentImportController {
    constructor(apartmentsService) {
        this.apartmentsService = apartmentsService;
    }
    importApartments(request, user, file, body) {
        if (!file) {
            throw new common_1.BadRequestException('File is required');
        }
        return this.apartmentsService.importFromFile({
            request,
            user,
            file,
            buildingId: body.buildingId,
            companyId: body.companyId,
        });
    }
};
exports.ApartmentImportController = ApartmentImportController;
__decorate([
    (0, common_1.Post)('import'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', {
        limits: { fileSize: APARTMENT_IMPORT_MAX_BYTES, files: 1 },
        fileFilter: apartmentImportFileFilter,
    })),
    (0, swagger_1.ApiOperation)({ summary: 'Import apartments from CSV, JSON, XML or XLSX file' }),
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
], ApartmentImportController.prototype, "importApartments", null);
exports.ApartmentImportController = ApartmentImportController = __decorate([
    (0, swagger_1.ApiTags)('Apartments'),
    (0, common_1.Controller)('apartments'),
    (0, common_1.UseGuards)(firebase_auth_guard_1.FirebaseAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('ManagementCompany', 'Accountant'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiCookieAuth)('__session'),
    __metadata("design:paramtypes", [apartments_service_1.ApartmentsService])
], ApartmentImportController);
