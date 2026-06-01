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
exports.ListInvoiceUploadsResponseDto = exports.InvoiceUploadHistoryItemDto = exports.InvoiceUploadErrorResponseDto = exports.UploadInvoicesBatchResponseDto = exports.UploadInvoicesBatchResultDto = exports.UploadInvoiceResponseDto = exports.ListInvoicesResponseDto = exports.CreateInvoiceResponseDto = exports.InvoiceItemDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class InvoiceItemDto {
}
exports.InvoiceItemDto = InvoiceItemDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], InvoiceItemDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], InvoiceItemDto.prototype, "apartmentId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], InvoiceItemDto.prototype, "month", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], InvoiceItemDto.prototype, "year", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], InvoiceItemDto.prototype, "amount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'pending' }),
    __metadata("design:type", String)
], InvoiceItemDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", String)
], InvoiceItemDto.prototype, "pdfUrl", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", String)
], InvoiceItemDto.prototype, "companyId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], InvoiceItemDto.prototype, "buildingId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], InvoiceItemDto.prototype, "externalId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], InvoiceItemDto.prototype, "period", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], InvoiceItemDto.prototype, "invoiceDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], InvoiceItemDto.prototype, "currency", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], InvoiceItemDto.prototype, "comment", void 0);
class CreateInvoiceResponseDto {
}
exports.CreateInvoiceResponseDto = CreateInvoiceResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: true }),
    __metadata("design:type", Boolean)
], CreateInvoiceResponseDto.prototype, "success", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: InvoiceItemDto }),
    __metadata("design:type", InvoiceItemDto)
], CreateInvoiceResponseDto.prototype, "invoice", void 0);
class ListInvoicesResponseDto {
}
exports.ListInvoicesResponseDto = ListInvoicesResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ type: [InvoiceItemDto] }),
    __metadata("design:type", Array)
], ListInvoicesResponseDto.prototype, "items", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        type: 'object',
        additionalProperties: { type: 'string' },
    }),
    __metadata("design:type", Object)
], ListInvoicesResponseDto.prototype, "query", void 0);
class UploadInvoiceResponseDto {
}
exports.UploadInvoiceResponseDto = UploadInvoiceResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: true }),
    __metadata("design:type", Boolean)
], UploadInvoiceResponseDto.prototype, "success", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'inv_12345' }),
    __metadata("design:type", String)
], UploadInvoiceResponseDto.prototype, "invoice_id", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'approval_12345' }),
    __metadata("design:type", String)
], UploadInvoiceResponseDto.prototype, "approval_id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Invoice uploaded successfully' }),
    __metadata("design:type", String)
], UploadInvoiceResponseDto.prototype, "message", void 0);
class UploadInvoicesBatchResultDto {
}
exports.UploadInvoicesBatchResultDto = UploadInvoicesBatchResultDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 0 }),
    __metadata("design:type", Number)
], UploadInvoicesBatchResultDto.prototype, "index", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'apartment-12.pdf' }),
    __metadata("design:type", String)
], UploadInvoicesBatchResultDto.prototype, "fileName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: true }),
    __metadata("design:type", Boolean)
], UploadInvoicesBatchResultDto.prototype, "success", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'inv_12345' }),
    __metadata("design:type", String)
], UploadInvoicesBatchResultDto.prototype, "invoice_id", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'approval_12345' }),
    __metadata("design:type", String)
], UploadInvoicesBatchResultDto.prototype, "approval_id", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Invoice uploaded successfully' }),
    __metadata("design:type", String)
], UploadInvoicesBatchResultDto.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Apartment not found' }),
    __metadata("design:type", String)
], UploadInvoicesBatchResultDto.prototype, "error", void 0);
class UploadInvoicesBatchResponseDto {
}
exports.UploadInvoicesBatchResponseDto = UploadInvoicesBatchResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: true }),
    __metadata("design:type", Boolean)
], UploadInvoicesBatchResponseDto.prototype, "success", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'batch_f2a54c8730b74e61' }),
    __metadata("design:type", String)
], UploadInvoicesBatchResponseDto.prototype, "batch_id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 10 }),
    __metadata("design:type", Number)
], UploadInvoicesBatchResponseDto.prototype, "total", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 9 }),
    __metadata("design:type", Number)
], UploadInvoicesBatchResponseDto.prototype, "processed", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1 }),
    __metadata("design:type", Number)
], UploadInvoicesBatchResponseDto.prototype, "failed", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Invoice batch processed' }),
    __metadata("design:type", String)
], UploadInvoicesBatchResponseDto.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [UploadInvoicesBatchResultDto] }),
    __metadata("design:type", Array)
], UploadInvoicesBatchResponseDto.prototype, "results", void 0);
class InvoiceUploadErrorResponseDto {
}
exports.InvoiceUploadErrorResponseDto = InvoiceUploadErrorResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: false }),
    __metadata("design:type", Boolean)
], InvoiceUploadErrorResponseDto.prototype, "success", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Apartment not found' }),
    __metadata("design:type", String)
], InvoiceUploadErrorResponseDto.prototype, "error", void 0);
class InvoiceUploadHistoryItemDto {
}
exports.InvoiceUploadHistoryItemDto = InvoiceUploadHistoryItemDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], InvoiceUploadHistoryItemDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], InvoiceUploadHistoryItemDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    __metadata("design:type", String)
], InvoiceUploadHistoryItemDto.prototype, "invoiceId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    __metadata("design:type", String)
], InvoiceUploadHistoryItemDto.prototype, "externalId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    __metadata("design:type", String)
], InvoiceUploadHistoryItemDto.prototype, "companyId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    __metadata("design:type", String)
], InvoiceUploadHistoryItemDto.prototype, "apartmentId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    __metadata("design:type", String)
], InvoiceUploadHistoryItemDto.prototype, "buildingId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    __metadata("design:type", String)
], InvoiceUploadHistoryItemDto.prototype, "fileName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    __metadata("design:type", String)
], InvoiceUploadHistoryItemDto.prototype, "error", void 0);
class ListInvoiceUploadsResponseDto {
}
exports.ListInvoiceUploadsResponseDto = ListInvoiceUploadsResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ type: [InvoiceUploadHistoryItemDto] }),
    __metadata("design:type", Array)
], ListInvoiceUploadsResponseDto.prototype, "items", void 0);
