import { Request, Response } from 'express';
import { RequestUser } from '../../../common/auth/request-user.type';
import { DocumentsService } from '../services/documents.service';
type UploadedBinaryFile = {
    fieldname?: string;
    buffer: Buffer;
    originalname?: string;
    mimetype?: string;
    size?: number;
};
export declare class DocumentsController {
    private readonly documentsService;
    constructor(documentsService: DocumentsService);
    list(user: RequestUser, apartmentId?: string): Promise<{
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
    upload(request: Request, user: RequestUser, uploadedFiles: UploadedBinaryFile[] | undefined): Promise<{
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
    download(user: RequestUser, documentId: string, response: Response): Promise<void>;
    remove(user: RequestUser, documentId: string): Promise<{
        success: boolean;
    }>;
    updateAccess(user: RequestUser, documentId: string, body: Record<string, unknown>): Promise<{
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
}
export {};
