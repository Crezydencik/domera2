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
exports.CreateMeterReadingDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class CreateMeterReadingDto {
}
exports.CreateMeterReadingDto = CreateMeterReadingDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Apartment id where the reading belongs.' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateMeterReadingDto.prototype, "apartmentId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Meter id.' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateMeterReadingDto.prototype, "meterId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['coldmeterwater', 'hotmeterwater'], description: 'Optional meter group key.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['coldmeterwater', 'hotmeterwater']),
    __metadata("design:type", String)
], CreateMeterReadingDto.prototype, "meterKey", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Previous meter value.' }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], CreateMeterReadingDto.prototype, "previousValue", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Current meter value.' }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], CreateMeterReadingDto.prototype, "currentValue", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Calculated consumption.' }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], CreateMeterReadingDto.prototype, "consumption", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Building id.' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateMeterReadingDto.prototype, "buildingId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Reading month.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], CreateMeterReadingDto.prototype, "month", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Reading year.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(2000),
    __metadata("design:type", Number)
], CreateMeterReadingDto.prototype, "year", void 0);
