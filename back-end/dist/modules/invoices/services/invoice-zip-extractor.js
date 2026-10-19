"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvoiceZipExtractor = void 0;
const common_1 = require("@nestjs/common");
const node_zlib_1 = require("node:zlib");
const values_1 = require("../../../common/utils/values");
const invoice_types_1 = require("../invoice.types");
let InvoiceZipExtractor = class InvoiceZipExtractor {
    isZipFile(file) {
        const name = (0, values_1.firstString)(file.originalname).toLowerCase();
        const mimetype = (0, values_1.firstString)(file.mimetype).toLowerCase();
        return name.endsWith('.zip')
            || mimetype === 'application/zip'
            || mimetype === 'application/x-zip-compressed'
            || mimetype === 'multipart/x-zip';
    }
    pathBaseName(value) {
        const normalized = value.replace(/\\/g, '/');
        return normalized.split('/').filter(Boolean).pop() ?? normalized;
    }
    findZipEndOfCentralDirectory(buffer) {
        const minOffset = Math.max(0, buffer.length - 65_557);
        for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
            if (buffer.readUInt32LE(offset) === 0x06054b50) {
                return offset;
            }
        }
        throw new common_1.BadRequestException('Invalid ZIP archive');
    }
    readZipEntryContent(params) {
        if ((params.generalPurposeFlag & 0x01) !== 0) {
            throw new common_1.BadRequestException(`Encrypted ZIP entries are not supported: ${params.entryName}`);
        }
        if (params.compressedSize === 0xffffffff || params.uncompressedSize === 0xffffffff) {
            throw new common_1.BadRequestException('ZIP64 archives are not supported');
        }
        if (params.uncompressedSize > invoice_types_1.MAX_INVOICE_PDF_BYTES && params.entryName.toLowerCase().endsWith('.pdf')) {
            throw new common_1.BadRequestException(`PDF file is too large: ${params.entryName}`);
        }
        if (params.localHeaderOffset < 0 || params.localHeaderOffset + 30 > params.archive.length) {
            throw new common_1.BadRequestException(`Invalid ZIP entry header: ${params.entryName}`);
        }
        if (params.archive.readUInt32LE(params.localHeaderOffset) !== 0x04034b50) {
            throw new common_1.BadRequestException(`Invalid ZIP entry header: ${params.entryName}`);
        }
        const fileNameLength = params.archive.readUInt16LE(params.localHeaderOffset + 26);
        const extraLength = params.archive.readUInt16LE(params.localHeaderOffset + 28);
        const dataOffset = params.localHeaderOffset + 30 + fileNameLength + extraLength;
        const dataEnd = dataOffset + params.compressedSize;
        if (dataOffset < 0 || dataEnd > params.archive.length) {
            throw new common_1.BadRequestException(`Invalid ZIP entry data: ${params.entryName}`);
        }
        const compressed = params.archive.subarray(dataOffset, dataEnd);
        let content;
        if (params.compressionMethod === 0) {
            content = Buffer.from(compressed);
        }
        else if (params.compressionMethod === 8) {
            try {
                content = (0, node_zlib_1.inflateRawSync)(compressed, {
                    maxOutputLength: Math.max(1, Math.min(invoice_types_1.MAX_INVOICE_PDF_BYTES, params.remainingBytes) + 1),
                });
            }
            catch {
                throw new common_1.BadRequestException(`Could not extract ZIP entry: ${params.entryName}`);
            }
        }
        else {
            throw new common_1.BadRequestException(`Unsupported ZIP compression method for ${params.entryName}`);
        }
        if (content.length !== params.uncompressedSize) {
            throw new common_1.BadRequestException(`Invalid ZIP entry size: ${params.entryName}`);
        }
        if (content.length > params.remainingBytes) {
            throw new common_1.BadRequestException(`ZIP archive is too large after extraction: ${params.entryName}`);
        }
        if (content.length > invoice_types_1.MAX_INVOICE_PDF_BYTES) {
            throw new common_1.BadRequestException(`ZIP entry is too large: ${params.entryName}`);
        }
        return content;
    }
    extractZipInvoiceBatch(file) {
        const archive = file.buffer;
        const archiveName = (0, values_1.firstString)(file.originalname, 'archive.zip');
        if (!archive || archive.length < 22) {
            throw new common_1.BadRequestException(`Invalid ZIP archive: ${archiveName}`);
        }
        if (archive.length > invoice_types_1.MAX_INVOICE_ZIP_BYTES) {
            throw new common_1.BadRequestException(`ZIP archive is too large: ${archiveName}`);
        }
        const eocdOffset = this.findZipEndOfCentralDirectory(archive);
        const entryCount = archive.readUInt16LE(eocdOffset + 10);
        const centralDirectorySize = archive.readUInt32LE(eocdOffset + 12);
        const centralDirectoryOffset = archive.readUInt32LE(eocdOffset + 16);
        if (entryCount > invoice_types_1.MAX_INVOICE_ZIP_ENTRIES) {
            throw new common_1.BadRequestException(`ZIP archive contains too many files: ${archiveName}`);
        }
        if (centralDirectoryOffset < 0
            || centralDirectorySize < 0
            || centralDirectoryOffset + centralDirectorySize > archive.length) {
            throw new common_1.BadRequestException(`Invalid ZIP archive: ${archiveName}`);
        }
        const pdfFiles = [];
        let itemsJson;
        let totalUncompressed = 0;
        let offset = centralDirectoryOffset;
        for (let index = 0; index < entryCount; index += 1) {
            if (offset + 46 > archive.length || archive.readUInt32LE(offset) !== 0x02014b50) {
                throw new common_1.BadRequestException(`Invalid ZIP central directory: ${archiveName}`);
            }
            const generalPurposeFlag = archive.readUInt16LE(offset + 8);
            const compressionMethod = archive.readUInt16LE(offset + 10);
            const compressedSize = archive.readUInt32LE(offset + 20);
            const uncompressedSize = archive.readUInt32LE(offset + 24);
            const fileNameLength = archive.readUInt16LE(offset + 28);
            const extraLength = archive.readUInt16LE(offset + 30);
            const commentLength = archive.readUInt16LE(offset + 32);
            const localHeaderOffset = archive.readUInt32LE(offset + 42);
            const nameStart = offset + 46;
            const nameEnd = nameStart + fileNameLength;
            if (nameEnd > archive.length) {
                throw new common_1.BadRequestException(`Invalid ZIP entry name: ${archiveName}`);
            }
            const rawName = archive.toString('utf8', nameStart, nameEnd).replace(/\\/g, '/');
            const entryName = rawName.replace(/^\/+/, '');
            const baseName = this.pathBaseName(entryName);
            const normalizedName = entryName.toLowerCase();
            const normalizedBaseName = baseName.toLowerCase();
            offset = nameEnd + extraLength + commentLength;
            if (!entryName
                || entryName.endsWith('/')
                || normalizedName.startsWith('__macosx/')
                || normalizedBaseName === '.ds_store') {
                continue;
            }
            const isPdf = normalizedName.endsWith('.pdf');
            const isItemsJson = normalizedBaseName === 'items.json';
            if (!isPdf && !isItemsJson) {
                continue;
            }
            if (totalUncompressed + uncompressedSize > invoice_types_1.MAX_INVOICE_ZIP_UNCOMPRESSED_BYTES) {
                throw new common_1.BadRequestException(`ZIP archive is too large after extraction: ${archiveName}`);
            }
            const content = this.readZipEntryContent({
                archive,
                entryName,
                compressionMethod,
                generalPurposeFlag,
                compressedSize,
                uncompressedSize,
                localHeaderOffset,
                remainingBytes: invoice_types_1.MAX_INVOICE_ZIP_UNCOMPRESSED_BYTES - totalUncompressed,
            });
            totalUncompressed += content.length;
            if (isItemsJson) {
                if (itemsJson !== undefined) {
                    throw new common_1.BadRequestException('ZIP archive must contain only one items.json file');
                }
                itemsJson = content.toString('utf8');
                continue;
            }
            pdfFiles.push({
                fieldname: 'files',
                buffer: content,
                originalname: baseName,
                mimetype: 'application/pdf',
                size: content.length,
            });
        }
        if (pdfFiles.length === 0) {
            throw new common_1.BadRequestException(`ZIP archive must contain at least one PDF file: ${archiveName}`);
        }
        if (pdfFiles.length > invoice_types_1.MAX_INVOICE_BATCH_FILES) {
            throw new common_1.BadRequestException(`Batch upload supports up to ${invoice_types_1.MAX_INVOICE_BATCH_FILES} invoices`);
        }
        return { files: pdfFiles, itemsJson };
    }
};
exports.InvoiceZipExtractor = InvoiceZipExtractor;
exports.InvoiceZipExtractor = InvoiceZipExtractor = __decorate([
    (0, common_1.Injectable)()
], InvoiceZipExtractor);
