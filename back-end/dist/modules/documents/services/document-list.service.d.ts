import { RequestUser } from '../../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { DocumentAccessService } from './document-access.service';
import { DocumentHelperService } from './document-helper.service';
export declare class DocumentListService {
    private readonly firebaseAdminService;
    private readonly accessService;
    private readonly helperService;
    constructor(firebaseAdminService: FirebaseAdminService, accessService: DocumentAccessService, helperService: DocumentHelperService);
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
}
