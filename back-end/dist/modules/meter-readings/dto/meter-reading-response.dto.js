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
exports.MeterReadingCreateResponseDto = exports.MeterReadingListResponseDto = exports.MeterReadingItemDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class MeterReadingItemDto {
}
exports.MeterReadingItemDto = MeterReadingItemDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], MeterReadingItemDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], MeterReadingItemDto.prototype, "apartmentId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], MeterReadingItemDto.prototype, "meterId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], MeterReadingItemDto.prototype, "previousValue", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], MeterReadingItemDto.prototype, "currentValue", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], MeterReadingItemDto.prototype, "consumption", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], MeterReadingItemDto.prototype, "month", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], MeterReadingItemDto.prototype, "year", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'coldmeterwater' }),
    __metadata("design:type", String)
], MeterReadingItemDto.prototype, "meterKey", void 0);
class MeterReadingListResponseDto {
}
exports.MeterReadingListResponseDto = MeterReadingListResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ type: [MeterReadingItemDto] }),
    __metadata("design:type", Array)
], MeterReadingListResponseDto.prototype, "items", void 0);
class MeterReadingCreateResponseDto {
}
exports.MeterReadingCreateResponseDto = MeterReadingCreateResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: true }),
    __metadata("design:type", Boolean)
], MeterReadingCreateResponseDto.prototype, "success", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: MeterReadingItemDto }),
    __metadata("design:type", MeterReadingItemDto)
], MeterReadingCreateResponseDto.prototype, "reading", void 0);
