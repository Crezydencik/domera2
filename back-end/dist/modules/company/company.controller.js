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
exports.CompanyController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const current_user_decorator_1 = require("../../common/auth/current-user.decorator");
const firebase_auth_guard_1 = require("../../common/auth/firebase-auth.guard");
const company_service_1 = require("./company.service");
let CompanyController = class CompanyController {
    constructor(companyService) {
        this.companyService = companyService;
    }
    create(request, user, body) {
        return this.companyService.create(request, user, body);
    }
    byId(request, user, companyId) {
        return this.companyService.byId(request, user, companyId);
    }
    listApiKeys(request, user, companyId) {
        return this.companyService.listApiKeys(request, user, companyId);
    }
    createApiKey(request, user, companyId, body) {
        return this.companyService.createApiKey(request, user, companyId, body);
    }
    revokeApiKey(request, user, companyId, keyId) {
        return this.companyService.revokeApiKey(request, user, companyId, keyId);
    }
    update(request, user, companyId, body) {
        return this.companyService.update(request, user, companyId, body);
    }
    addMember(request, user, companyId, body) {
        return this.companyService.addMember(request, user, companyId, body);
    }
    removeMember(request, user, companyId, memberId) {
        return this.companyService.removeMember(request, user, companyId, memberId);
    }
};
exports.CompanyController = CompanyController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create company' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CompanyController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(':companyId'),
    (0, swagger_1.ApiOperation)({ summary: 'Get company by id' }),
    (0, swagger_1.ApiParam)({ name: 'companyId', required: true, type: String }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Param)('companyId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String]),
    __metadata("design:returntype", void 0)
], CompanyController.prototype, "byId", null);
__decorate([
    (0, common_1.Get)(':companyId/api-keys'),
    (0, swagger_1.ApiOperation)({ summary: 'List company API keys' }),
    (0, swagger_1.ApiParam)({ name: 'companyId', required: true, type: String }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Param)('companyId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String]),
    __metadata("design:returntype", void 0)
], CompanyController.prototype, "listApiKeys", null);
__decorate([
    (0, common_1.Post)(':companyId/api-keys'),
    (0, swagger_1.ApiOperation)({ summary: 'Create an invoice upload API key' }),
    (0, swagger_1.ApiParam)({ name: 'companyId', required: true, type: String }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Param)('companyId')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, Object]),
    __metadata("design:returntype", void 0)
], CompanyController.prototype, "createApiKey", null);
__decorate([
    (0, common_1.Delete)(':companyId/api-keys/:keyId'),
    (0, swagger_1.ApiOperation)({ summary: 'Revoke a company API key' }),
    (0, swagger_1.ApiParam)({ name: 'companyId', required: true, type: String }),
    (0, swagger_1.ApiParam)({ name: 'keyId', required: true, type: String }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Param)('companyId')),
    __param(3, (0, common_1.Param)('keyId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, String]),
    __metadata("design:returntype", void 0)
], CompanyController.prototype, "revokeApiKey", null);
__decorate([
    (0, common_1.Patch)(':companyId'),
    (0, swagger_1.ApiOperation)({ summary: 'Update company by id' }),
    (0, swagger_1.ApiParam)({ name: 'companyId', required: true, type: String }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Param)('companyId')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, Object]),
    __metadata("design:returntype", void 0)
], CompanyController.prototype, "update", null);
__decorate([
    (0, common_1.Post)(':companyId/members'),
    (0, swagger_1.ApiOperation)({ summary: 'Add a management company member by email' }),
    (0, swagger_1.ApiParam)({ name: 'companyId', required: true, type: String }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Param)('companyId')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, Object]),
    __metadata("design:returntype", void 0)
], CompanyController.prototype, "addMember", null);
__decorate([
    (0, common_1.Delete)(':companyId/members/:memberId'),
    (0, swagger_1.ApiOperation)({ summary: 'Remove a management company member' }),
    (0, swagger_1.ApiParam)({ name: 'companyId', required: true, type: String }),
    (0, swagger_1.ApiParam)({ name: 'memberId', required: true, type: String }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Param)('companyId')),
    __param(3, (0, common_1.Param)('memberId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, String]),
    __metadata("design:returntype", void 0)
], CompanyController.prototype, "removeMember", null);
exports.CompanyController = CompanyController = __decorate([
    (0, swagger_1.ApiTags)('Company'),
    (0, common_1.Controller)('company'),
    (0, common_1.UseGuards)(firebase_auth_guard_1.FirebaseAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiCookieAuth)('__session'),
    __metadata("design:paramtypes", [company_service_1.CompanyService])
], CompanyController);
