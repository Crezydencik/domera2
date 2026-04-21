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
exports.SendPasswordResetResponseDto = exports.RegisterEmailCodeVerifyResponseDto = exports.RegisterEmailCodeRequestResponseDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class RegisterEmailCodeRequestResponseDto {
}
exports.RegisterEmailCodeRequestResponseDto = RegisterEmailCodeRequestResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: true }),
    __metadata("design:type", Boolean)
], RegisterEmailCodeRequestResponseDto.prototype, "success", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 3600 }),
    __metadata("design:type", Number)
], RegisterEmailCodeRequestResponseDto.prototype, "expiresInSeconds", void 0);
class RegisterEmailCodeVerifyResponseDto {
}
exports.RegisterEmailCodeVerifyResponseDto = RegisterEmailCodeVerifyResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: true }),
    __metadata("design:type", Boolean)
], RegisterEmailCodeVerifyResponseDto.prototype, "success", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], RegisterEmailCodeVerifyResponseDto.prototype, "verificationToken", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 3600 }),
    __metadata("design:type", Number)
], RegisterEmailCodeVerifyResponseDto.prototype, "expiresInSeconds", void 0);
class SendPasswordResetResponseDto {
}
exports.SendPasswordResetResponseDto = SendPasswordResetResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: true }),
    __metadata("design:type", Boolean)
], SendPasswordResetResponseDto.prototype, "success", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Vēstule nosūtīta' }),
    __metadata("design:type", String)
], SendPasswordResetResponseDto.prototype, "message", void 0);
