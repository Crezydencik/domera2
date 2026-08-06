import { DocumentScope, UnknownRecord, UploadedDocumentFile } from '../types/document.types';
export declare class DocumentHelperService {
    firstString(...values: unknown[]): string;
    normalizeScope(value: unknown): DocumentScope;
    sanitizeFileName(value: unknown): string;
    buildAsciiDownloadFileName(value: string): string;
    buildContentDisposition(fileName: string): string;
    sanitizePathSegment(value: string): string;
    formatDate(value: unknown): string;
    parseOptionalDate(value: unknown): Date | null;
    omitUndefined(input: UnknownRecord): UnknownRecord;
    isApartmentScopedDocument(scope: unknown): boolean;
    validateFile(file: UploadedDocumentFile): void;
    serializeDocument(id: string, data: UnknownRecord): {
        id: string;
        title: string;
        fileName: string;
        mimeType: string;
        size: number;
        scope: string;
        companyId: string | undefined;
        buildingId: string | undefined;
        buildingName: string | undefined;
        apartmentId: string | undefined;
        apartmentLabel: string | undefined;
        ownerUserId: string | undefined;
        uploaderRole: string | undefined;
        uploadedAt: string;
        updatedAt: string;
        downloadUrl: string;
    };
}
