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
exports.ResidentApartmentsResponseDto = exports.SerializableObjectDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class SerializableObjectDto {
}
exports.SerializableObjectDto = SerializableObjectDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        type: 'object',
        additionalProperties: true,
    }),
    __metadata("design:type", Object)
], SerializableObjectDto.prototype, "value", void 0);
class ResidentApartmentsResponseDto {
}
exports.ResidentApartmentsResponseDto = ResidentApartmentsResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        type: 'array',
        items: {
            type: 'object',
            additionalProperties: true,
        },
    }),
    __metadata("design:type", Array)
], ResidentApartmentsResponseDto.prototype, "apartments", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        type: 'array',
        items: {
            type: 'object',
            additionalProperties: true,
        },
    }),
    __metadata("design:type", Array)
], ResidentApartmentsResponseDto.prototype, "buildings", void 0);
