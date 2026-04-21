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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AcceptInvitationResponseDto = exports.ResolveInvitationResponseDto = exports.SendInvitationResponseDto = exports.InvitationSummaryDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class InvitationSummaryDto {
}
exports.InvitationSummaryDto = InvitationSummaryDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], InvitationSummaryDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], InvitationSummaryDto.prototype, "email", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true }),
    __metadata("design:type", Object)
], InvitationSummaryDto.prototype, "apartmentId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'pending' }),
    __metadata("design:type", String)
], InvitationSummaryDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true, example: '2026-04-19T12:00:00.000Z' }),
    __metadata("design:type", Object)
], InvitationSummaryDto.prototype, "expiresAt", void 0);
class SendInvitationResponseDto {
}
exports.SendInvitationResponseDto = SendInvitationResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: true }),
    __metadata("design:type", Boolean)
], SendInvitationResponseDto.prototype, "success", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], SendInvitationResponseDto.prototype, "invitationId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], SendInvitationResponseDto.prototype, "invitationLink", void 0);
class ResolveInvitationResponseDto {
}
exports.ResolveInvitationResponseDto = ResolveInvitationResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ type: InvitationSummaryDto }),
    __metadata("design:type", InvitationSummaryDto)
], ResolveInvitationResponseDto.prototype, "invitation", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: false }),
    __metadata("design:type", Boolean)
], ResolveInvitationResponseDto.prototype, "existingAccountDetected", void 0);
class AcceptInvitationResponseDto {
}
exports.AcceptInvitationResponseDto = AcceptInvitationResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: true }),
    __metadata("design:type", Boolean)
], AcceptInvitationResponseDto.prototype, "success", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'authenticated' }),
    __metadata("design:type", String)
], AcceptInvitationResponseDto.prototype, "mode", void 0);
