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
exports.ImportApartmentsResponseDto = exports.ImportApartmentsResultsDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class ImportApartmentsResultsDto {
}
exports.ImportApartmentsResultsDto = ImportApartmentsResultsDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], ImportApartmentsResultsDto.prototype, "imported", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [String] }),
    __metadata("design:type", Array)
], ImportApartmentsResultsDto.prototype, "errors", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [String] }),
    __metadata("design:type", Array)
], ImportApartmentsResultsDto.prototype, "skippedDuplicates", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [String] }),
    __metadata("design:type", Array)
], ImportApartmentsResultsDto.prototype, "createdApartments", void 0);
class ImportApartmentsResponseDto {
}
exports.ImportApartmentsResponseDto = ImportApartmentsResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: true }),
    __metadata("design:type", Boolean)
], ImportApartmentsResponseDto.prototype, "success", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: ImportApartmentsResultsDto }),
    __metadata("design:type", ImportApartmentsResultsDto)
], ImportApartmentsResponseDto.prototype, "results", void 0);
