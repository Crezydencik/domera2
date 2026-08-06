import { RequestUser } from '../../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { UnknownRecord } from '../types/document.types';
import { DocumentAccessService } from './document-access.service';
import { DocumentHelperService } from './document-helper.service';
import { DocumentMetadataService } from './document-metadata.service';
export declare class DocumentAccessUpdateService {
    private readonly firebaseAdminService;
    private readonly accessService;
    private readonly helperService;
    private readonly metadataService;
    constructor(firebaseAdminService: FirebaseAdminService, accessService: DocumentAccessService, helperService: DocumentHelperService, metadataService: DocumentMetadataService);
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
}
