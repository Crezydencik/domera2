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
exports.UploadInvoicesBatchDto = exports.UploadInvoiceDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class UploadInvoiceDto {
}
exports.UploadInvoiceDto = UploadInvoiceDto;
__decorate([
    (0, swagger_1.ApiProperty)({ type: 'string', format: 'binary', description: 'Invoice PDF file.' }),
    __metadata("design:type", String)
], UploadInvoiceDto.prototype, "file", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Building/house id. Optional for API keys bound to a building.' }),
    __metadata("design:type", String)
], UploadInvoiceDto.prototype, "buildingId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Apartment id. Optional when contractNumber, apartmentNumber, or account id is provided.' }),
    __metadata("design:type", String)
], UploadInvoiceDto.prototype, "apartmentId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Apartment number inside the selected building.' }),
    __metadata("design:type", String)
], UploadInvoiceDto.prototype, "apartmentNumber", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Contract/agreement number linked to the apartment, owner, or resident.' }),
    __metadata("design:type", String)
], UploadInvoiceDto.prototype, "contractNumber", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2026-05', description: 'Billing period in YYYY-MM format.' }),
    __metadata("design:type", String)
], UploadInvoiceDto.prototype, "period", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2026-05-25', description: 'Invoice issue date.' }),
    __metadata("design:type", String)
], UploadInvoiceDto.prototype, "invoiceDate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 124.55 }),
    __metadata("design:type", Number)
], UploadInvoiceDto.prototype, "amount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'EUR' }),
    __metadata("design:type", String)
], UploadInvoiceDto.prototype, "currency", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'erp-2026-05-apt-42', description: 'External invoice id for deduplication.' }),
    __metadata("design:type", String)
], UploadInvoiceDto.prototype, "externalId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'pending' }),
    __metadata("design:type", String)
], UploadInvoiceDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Optional company id. API keys are already company-scoped.' }),
    __metadata("design:type", String)
], UploadInvoiceDto.prototype, "companyId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Optional free-text comment.' }),
    __metadata("design:type", String)
], UploadInvoiceDto.prototype, "comment", void 0);
class UploadInvoicesBatchDto {
}
exports.UploadInvoicesBatchDto = UploadInvoicesBatchDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        type: 'array',
        items: { type: 'string', format: 'binary' },
        description: 'Invoice PDF files or one ZIP archive containing PDFs and optional items.json. Send repeated files fields or files[] fields.',
    }),
    __metadata("design:type", Array)
], UploadInvoicesBatchDto.prototype, "files", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        type: 'string',
        format: 'binary',
        description: 'JSON file with metadata array for each PDF. Optional when items.json is included inside the ZIP archive. Items are matched by order, fileIndex, or fileName.',
        example: JSON.stringify([
            {
                fileName: 'apartment-12.pdf',
                buildingId: 'building_123',
                apartmentId: 'apt_12',
                period: '2026-05',
                invoiceDate: '2026-05-27',
                amount: 125.5,
                currency: 'EUR',
                externalId: 'erp-2026-05-apt-12',
                status: 'issued',
            },
        ]),
    }),
    __metadata("design:type", String)
], UploadInvoicesBatchDto.prototype, "items", void 0);
