import { Request } from 'express';
import { RequestUser } from '../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../common/infrastructure/firebase/firebase-admin.service';
type UploadedDocumentFile = {
    buffer: Buffer;
    originalname?: string;
    mimetype?: string;
    size?: number;
};
type UnknownRecord = Record<string, unknown>;
type DocumentFilePayload = {
    buffer: Buffer;
    fileName: string;
    contentType: string;
};
export declare class DocumentsService {
    private readonly firebaseAdminService;
    private readonly logger;
    constructor(firebaseAdminService: FirebaseAdminService);
    private assertAuthenticated;
    private firstString;
    private normalizeScope;
    private sanitizeFileName;
    private buildAsciiDownloadFileName;
    private buildContentDisposition;
    private sanitizePathSegment;
    private formatDate;
    private parseOptionalDate;
    private omitUndefined;
    private validateFile;
    private isApartmentMember;
    private memberAccessForApartment;
    private documentVisibleForApartmentAccess;
    private getApartment;
    private getBuilding;
    private resolveCompanyId;
    private resolveMemberApartments;
    private canAccessDocument;
    private serializeDocument;
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
    download(user: RequestUser, documentId: string): Promise<DocumentFilePayload>;
    remove(user: RequestUser, documentId: string): Promise<{
        success: boolean;
    }>;
}
export {};
