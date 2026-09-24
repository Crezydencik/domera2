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
exports.DocumentsController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const current_user_decorator_1 = require("../../../common/auth/current-user.decorator");
const firebase_auth_guard_1 = require("../../../common/auth/firebase-auth.guard");
const role_constants_1 = require("../../../common/auth/role.constants");
const roles_decorator_1 = require("../../../common/auth/roles.decorator");
const roles_guard_1 = require("../../../common/auth/roles.guard");
const documents_service_1 = require("../services/documents.service");
const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;
function buildAsciiFileName(value) {
    return value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\x20-\x7E]+/g, '_')
        .replace(/[";]/g, '_')
        .replace(/\s+/g, ' ')
        .trim() || 'document';
}
function buildContentDisposition(fileName) {
    return `inline; filename="${buildAsciiFileName(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
let DocumentsController = class DocumentsController {
    constructor(documentsService) {
        this.documentsService = documentsService;
    }
    list(user, apartmentId) {
        return this.documentsService.list(user, { apartmentId });
    }
    upload(request, user, uploadedFiles) {
        const file = uploadedFiles?.[0];
        if (!file)
            throw new common_1.BadRequestException('File is required');
        return this.documentsService.upload(request, user, file, request.body);
    }
    async download(user, documentId, response) {
        const file = await this.documentsService.download(user, documentId);
        response.setHeader('Content-Type', file.contentType);
        response.setHeader('Content-Disposition', buildContentDisposition(file.fileName));
        response.send(file.buffer);
    }
    remove(user, documentId) {
        return this.documentsService.remove(user, documentId);
    }
    updateAccess(user, documentId, body) {
        return this.documentsService.updateAccess(user, documentId, body);
    }
};
exports.DocumentsController = DocumentsController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('apartmentId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], DocumentsController.prototype, "list", null);
__decorate([
    (0, common_1.Post)('upload'),
    (0, common_1.UseInterceptors)((0, platform_express_1.AnyFilesInterceptor)({ limits: { fileSize: DOCUMENT_MAX_BYTES, files: 1 } })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.UploadedFiles)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], DocumentsController.prototype, "upload", null);
__decorate([
    (0, common_1.Get)(':documentId/download'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('documentId')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], DocumentsController.prototype, "download", null);
__decorate([
    (0, common_1.Delete)(':documentId'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('documentId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], DocumentsController.prototype, "remove", null);
__decorate([
    (0, common_1.Patch)(':documentId/access'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('documentId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], DocumentsController.prototype, "updateAccess", null);
exports.DocumentsController = DocumentsController = __decorate([
    (0, common_1.Controller)('documents'),
    (0, common_1.UseGuards)(firebase_auth_guard_1.FirebaseAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('PlatformAdmin', ...role_constants_1.STAFF_ROLES, ...role_constants_1.PROPERTY_MEMBER_ROLES),
    __metadata("design:paramtypes", [documents_service_1.DocumentsService])
], DocumentsController);
