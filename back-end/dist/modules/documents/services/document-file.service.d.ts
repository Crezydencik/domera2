import { RequestUser } from '../../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { DocumentFilePayload } from '../types/document.types';
import { DocumentAccessService } from './document-access.service';
import { DocumentHelperService } from './document-helper.service';
import { DocumentMetadataService } from './document-metadata.service';
export declare class DocumentFileService {
    private readonly firebaseAdminService;
    private readonly accessService;
    private readonly helperService;
    private readonly metadataService;
    constructor(firebaseAdminService: FirebaseAdminService, accessService: DocumentAccessService, helperService: DocumentHelperService, metadataService: DocumentMetadataService);
    download(user: RequestUser, documentId: string): Promise<DocumentFilePayload>;
    remove(user: RequestUser, documentId: string): Promise<{
        success: boolean;
    }>;
}
