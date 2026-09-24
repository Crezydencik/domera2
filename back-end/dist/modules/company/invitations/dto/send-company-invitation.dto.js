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
exports.SendCompanyInvitationDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class SendCompanyInvitationDto {
}
exports.SendCompanyInvitationDto = SendCompanyInvitationDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Invitee email.' }),
    (0, class_validator_1.IsEmail)(),
    __metadata("design:type", String)
], SendCompanyInvitationDto.prototype, "email", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Company id the invite belongs to.' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendCompanyInvitationDto.prototype, "companyId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Building id the invite is scoped to.' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendCompanyInvitationDto.prototype, "buildingId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['Accountant', 'ManagementCompany'], description: 'Role granted by invitation.' }),
    (0, class_validator_1.IsIn)(['Accountant', 'ManagementCompany']),
    __metadata("design:type", String)
], SendCompanyInvitationDto.prototype, "role", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Optional building display name.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendCompanyInvitationDto.prototype, "buildingName", void 0);
