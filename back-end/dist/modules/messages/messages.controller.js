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
exports.MessagesController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const swagger_1 = require("@nestjs/swagger");
const current_user_decorator_1 = require("../../common/auth/current-user.decorator");
const firebase_auth_guard_1 = require("../../common/auth/firebase-auth.guard");
const role_constants_1 = require("../../common/auth/role.constants");
const roles_decorator_1 = require("../../common/auth/roles.decorator");
const roles_guard_1 = require("../../common/auth/roles.guard");
const messages_types_1 = require("./messages.types");
const messages_service_1 = require("./services/messages.service");
const FILES = (0, platform_express_1.AnyFilesInterceptor)({ limits: { fileSize: messages_types_1.MESSAGE_LIMITS.fileBytes, files: messages_types_1.MESSAGE_LIMITS.files } });
function contentDisposition(fileName, contentType) {
    const ascii = fileName.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]+/g, '_').replace(/[";]/g, '_').trim() || 'file';
    const inline = contentType === 'application/pdf' || contentType.startsWith('image/');
    return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
let MessagesController = class MessagesController {
    constructor(messages) {
        this.messages = messages;
    }
    list(request, user, buildingId) {
        return this.messages.listForCompany(request, user, buildingId);
    }
    create(request, user, files) {
        return this.messages.create(request, user, (request.body ?? {}), files ?? []);
    }
    mine(user) {
        return this.messages.listMine(user);
    }
    update(user, messageId, body) {
        if (!body || typeof body !== 'object')
            throw new common_1.BadRequestException('Body is required');
        return this.messages.update(user, messageId, body);
    }
    reply(request, user, messageId, files) {
        return this.messages.reply(request, user, messageId, (request.body ?? {}), files ?? []);
    }
    async attachment(user, messageId, attachmentId, response) {
        const file = await this.messages.attachment(user, messageId, attachmentId);
        response.setHeader('Content-Type', file.contentType);
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
        response.setHeader('Cache-Control', 'private, max-age=300');
        response.setHeader('Content-Disposition', contentDisposition(file.fileName, file.contentType));
        response.send(file.buffer);
    }
};
exports.MessagesController = MessagesController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Query)('buildingId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String]),
    __metadata("design:returntype", void 0)
], MessagesController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)(...role_constants_1.PROPERTY_MEMBER_ROLES),
    (0, common_1.UseInterceptors)(FILES),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.UploadedFiles)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], MessagesController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('mine'),
    (0, roles_decorator_1.Roles)(...role_constants_1.PROPERTY_MEMBER_ROLES),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], MessagesController.prototype, "mine", null);
__decorate([
    (0, common_1.Patch)(':messageId'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('messageId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], MessagesController.prototype, "update", null);
__decorate([
    (0, common_1.Post)(':messageId/reply'),
    (0, common_1.UseInterceptors)(FILES),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Param)('messageId')),
    __param(3, (0, common_1.UploadedFiles)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, Object]),
    __metadata("design:returntype", void 0)
], MessagesController.prototype, "reply", null);
__decorate([
    (0, common_1.Get)(':messageId/attachments/:attachmentId'),
    (0, roles_decorator_1.Roles)('ManagementCompany', ...role_constants_1.PROPERTY_MEMBER_ROLES),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('messageId')),
    __param(2, (0, common_1.Param)('attachmentId')),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", Promise)
], MessagesController.prototype, "attachment", null);
exports.MessagesController = MessagesController = __decorate([
    (0, swagger_1.ApiTags)('messages'),
    (0, common_1.Controller)('messages'),
    (0, common_1.UseGuards)(firebase_auth_guard_1.FirebaseAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('ManagementCompany'),
    __metadata("design:paramtypes", [messages_service_1.MessagesService])
], MessagesController);
