import type { UploadedInvoiceFile } from '../invoice.types';
export declare class InvoiceZipExtractor {
    isZipFile(file: UploadedInvoiceFile): boolean;
    pathBaseName(value: string): string;
    findZipEndOfCentralDirectory(buffer: Buffer): number;
    readZipEntryContent(params: {
        archive: Buffer;
        entryName: string;
        compressionMethod: number;
        generalPurposeFlag: number;
        compressedSize: number;
        uncompressedSize: number;
        localHeaderOffset: number;
        remainingBytes: number;
    }): Buffer;
    extractZipInvoiceBatch(file: UploadedInvoiceFile): {
        files: UploadedInvoiceFile[];
        itemsJson?: string;
    };
}
