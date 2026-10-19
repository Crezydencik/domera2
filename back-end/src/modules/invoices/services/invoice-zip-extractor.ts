import { BadRequestException, Injectable } from '@nestjs/common';
import { inflateRawSync } from 'node:zlib';
import { firstString } from '../../../common/utils/values';
import { MAX_INVOICE_PDF_BYTES, MAX_INVOICE_BATCH_FILES, MAX_INVOICE_ZIP_BYTES, MAX_INVOICE_ZIP_ENTRIES, MAX_INVOICE_ZIP_UNCOMPRESSED_BYTES } from '../invoice.types';
import type { UploadedInvoiceFile } from '../invoice.types';

@Injectable()
export class InvoiceZipExtractor {
  isZipFile(file: UploadedInvoiceFile): boolean {
    const name = firstString(file.originalname).toLowerCase();
    const mimetype = firstString(file.mimetype).toLowerCase();

    return name.endsWith('.zip')
      || mimetype === 'application/zip'
      || mimetype === 'application/x-zip-compressed'
      || mimetype === 'multipart/x-zip';
  }

  pathBaseName(value: string): string {
    const normalized = value.replace(/\\/g, '/');
    return normalized.split('/').filter(Boolean).pop() ?? normalized;
  }

  findZipEndOfCentralDirectory(buffer: Buffer): number {
    const minOffset = Math.max(0, buffer.length - 65_557);
    for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
      if (buffer.readUInt32LE(offset) === 0x06054b50) {
        return offset;
      }
    }

    throw new BadRequestException('Invalid ZIP archive');
  }

  readZipEntryContent(params: {
    archive: Buffer;
    entryName: string;
    compressionMethod: number;
    generalPurposeFlag: number;
    compressedSize: number;
    uncompressedSize: number;
    localHeaderOffset: number;
    /** Remaining extraction budget for the whole archive (actual bytes, not declared sizes). */
    remainingBytes: number;
  }): Buffer {
    if ((params.generalPurposeFlag & 0x01) !== 0) {
      throw new BadRequestException(`Encrypted ZIP entries are not supported: ${params.entryName}`);
    }

    if (params.compressedSize === 0xffffffff || params.uncompressedSize === 0xffffffff) {
      throw new BadRequestException('ZIP64 archives are not supported');
    }

    if (params.uncompressedSize > MAX_INVOICE_PDF_BYTES && params.entryName.toLowerCase().endsWith('.pdf')) {
      throw new BadRequestException(`PDF file is too large: ${params.entryName}`);
    }

    if (params.localHeaderOffset < 0 || params.localHeaderOffset + 30 > params.archive.length) {
      throw new BadRequestException(`Invalid ZIP entry header: ${params.entryName}`);
    }

    if (params.archive.readUInt32LE(params.localHeaderOffset) !== 0x04034b50) {
      throw new BadRequestException(`Invalid ZIP entry header: ${params.entryName}`);
    }

    const fileNameLength = params.archive.readUInt16LE(params.localHeaderOffset + 26);
    const extraLength = params.archive.readUInt16LE(params.localHeaderOffset + 28);
    const dataOffset = params.localHeaderOffset + 30 + fileNameLength + extraLength;
    const dataEnd = dataOffset + params.compressedSize;
    if (dataOffset < 0 || dataEnd > params.archive.length) {
      throw new BadRequestException(`Invalid ZIP entry data: ${params.entryName}`);
    }

    const compressed = params.archive.subarray(dataOffset, dataEnd);
    let content: Buffer;
    if (params.compressionMethod === 0) {
      content = Buffer.from(compressed);
    } else if (params.compressionMethod === 8) {
      try {
        // Cap output by the per-file AND the remaining archive budget: declared sizes come from
        // the archive itself and cannot be trusted (zip bomb with sizes set to 0).
        content = inflateRawSync(compressed, {
          maxOutputLength: Math.max(1, Math.min(MAX_INVOICE_PDF_BYTES, params.remainingBytes) + 1),
        });
      } catch {
        throw new BadRequestException(`Could not extract ZIP entry: ${params.entryName}`);
      }
    } else {
      throw new BadRequestException(`Unsupported ZIP compression method for ${params.entryName}`);
    }

    if (content.length !== params.uncompressedSize) {
      throw new BadRequestException(`Invalid ZIP entry size: ${params.entryName}`);
    }
    if (content.length > params.remainingBytes) {
      throw new BadRequestException(`ZIP archive is too large after extraction: ${params.entryName}`);
    }
    if (content.length > MAX_INVOICE_PDF_BYTES) {
      throw new BadRequestException(`ZIP entry is too large: ${params.entryName}`);
    }

    return content;
  }

  extractZipInvoiceBatch(file: UploadedInvoiceFile): {
    files: UploadedInvoiceFile[];
    itemsJson?: string;
  } {
    const archive = file.buffer;
    const archiveName = firstString(file.originalname, 'archive.zip');
    if (!archive || archive.length < 22) {
      throw new BadRequestException(`Invalid ZIP archive: ${archiveName}`);
    }

    if (archive.length > MAX_INVOICE_ZIP_BYTES) {
      throw new BadRequestException(`ZIP archive is too large: ${archiveName}`);
    }

    const eocdOffset = this.findZipEndOfCentralDirectory(archive);
    const entryCount = archive.readUInt16LE(eocdOffset + 10);
    const centralDirectorySize = archive.readUInt32LE(eocdOffset + 12);
    const centralDirectoryOffset = archive.readUInt32LE(eocdOffset + 16);
    if (entryCount > MAX_INVOICE_ZIP_ENTRIES) {
      throw new BadRequestException(`ZIP archive contains too many files: ${archiveName}`);
    }

    if (
      centralDirectoryOffset < 0
      || centralDirectorySize < 0
      || centralDirectoryOffset + centralDirectorySize > archive.length
    ) {
      throw new BadRequestException(`Invalid ZIP archive: ${archiveName}`);
    }

    const pdfFiles: UploadedInvoiceFile[] = [];
    let itemsJson: string | undefined;
    let totalUncompressed = 0;
    let offset = centralDirectoryOffset;

    for (let index = 0; index < entryCount; index += 1) {
      if (offset + 46 > archive.length || archive.readUInt32LE(offset) !== 0x02014b50) {
        throw new BadRequestException(`Invalid ZIP central directory: ${archiveName}`);
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
        throw new BadRequestException(`Invalid ZIP entry name: ${archiveName}`);
      }

      const rawName = archive.toString('utf8', nameStart, nameEnd).replace(/\\/g, '/');
      const entryName = rawName.replace(/^\/+/, '');
      const baseName = this.pathBaseName(entryName);
      const normalizedName = entryName.toLowerCase();
      const normalizedBaseName = baseName.toLowerCase();
      offset = nameEnd + extraLength + commentLength;

      if (
        !entryName
        || entryName.endsWith('/')
        || normalizedName.startsWith('__macosx/')
        || normalizedBaseName === '.ds_store'
      ) {
        continue;
      }

      const isPdf = normalizedName.endsWith('.pdf');
      const isItemsJson = normalizedBaseName === 'items.json';
      if (!isPdf && !isItemsJson) {
        continue;
      }

      if (totalUncompressed + uncompressedSize > MAX_INVOICE_ZIP_UNCOMPRESSED_BYTES) {
        throw new BadRequestException(`ZIP archive is too large after extraction: ${archiveName}`);
      }

      const content = this.readZipEntryContent({
        archive,
        entryName,
        compressionMethod,
        generalPurposeFlag,
        compressedSize,
        uncompressedSize,
        localHeaderOffset,
        remainingBytes: MAX_INVOICE_ZIP_UNCOMPRESSED_BYTES - totalUncompressed,
      });
      totalUncompressed += content.length;

      if (isItemsJson) {
        if (itemsJson !== undefined) {
          throw new BadRequestException('ZIP archive must contain only one items.json file');
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
      throw new BadRequestException(`ZIP archive must contain at least one PDF file: ${archiveName}`);
    }

    if (pdfFiles.length > MAX_INVOICE_BATCH_FILES) {
      throw new BadRequestException(`Batch upload supports up to ${MAX_INVOICE_BATCH_FILES} invoices`);
    }

    return { files: pdfFiles, itemsJson };
  }
}
