import { Request } from 'express';
import { RequestUser } from '../../../common/auth/request-user.type';
import { UnknownRecord, UploadedDocumentFile } from '../types/document.types';
import { DocumentAccessUpdateService } from './document-access-update.service';
import { DocumentFileService } from './document-file.service';
import { DocumentListService } from './document-list.service';
import { DocumentUploadService } from './document-upload.service';
export declare class DocumentsService {
    private readonly listService;
    private readonly uploadService;
    private readonly accessUpdateService;
    private readonly fileService;
    constructor(listService: DocumentListService, uploadService: DocumentUploadService, accessUpdateService: DocumentAccessUpdateService, fileService: DocumentFileService);
    list(user: RequestUser, filters?: {
        apartmentId?: string;
    }): Promise<{
        items: {
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
        }[];
    }>;
    upload(request: Request, user: RequestUser, file: UploadedDocumentFile, body: UnknownRecord): Promise<{
        item: {
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
    }>;
    updateAccess(user: RequestUser, documentId: string, body: UnknownRecord): Promise<{
        item: {
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
    }>;
    download(user: RequestUser, documentId: string): Promise<import("../types/document.types").DocumentFilePayload>;
    remove(user: RequestUser, documentId: string): Promise<{
        success: boolean;
    }>;
}
