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
exports.CompanyInvitationMutationResponseDto = exports.CompanyInvitationListResponseDto = exports.CompanyInvitationItemDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class CompanyInvitationItemDto {
}
exports.CompanyInvitationItemDto = CompanyInvitationItemDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CompanyInvitationItemDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CompanyInvitationItemDto.prototype, "email", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CompanyInvitationItemDto.prototype, "companyId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CompanyInvitationItemDto.prototype, "buildingId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'ManagementCompany' }),
    __metadata("design:type", String)
], CompanyInvitationItemDto.prototype, "role", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'pending' }),
    __metadata("design:type", String)
], CompanyInvitationItemDto.prototype, "status", void 0);
class CompanyInvitationListResponseDto {
}
exports.CompanyInvitationListResponseDto = CompanyInvitationListResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ type: [CompanyInvitationItemDto] }),
    __metadata("design:type", Array)
], CompanyInvitationListResponseDto.prototype, "invitations", void 0);
class CompanyInvitationMutationResponseDto {
}
exports.CompanyInvitationMutationResponseDto = CompanyInvitationMutationResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: true }),
    __metadata("design:type", Boolean)
], CompanyInvitationMutationResponseDto.prototype, "success", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ required: false }),
    __metadata("design:type", String)
], CompanyInvitationMutationResponseDto.prototype, "invitationId", void 0);
