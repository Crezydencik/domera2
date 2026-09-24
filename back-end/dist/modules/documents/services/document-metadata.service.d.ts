import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { DocumentHelperService } from './document-helper.service';
import { UnknownRecord } from '../types/document.types';
export declare class DocumentMetadataService {
    private readonly firebaseAdminService;
    private readonly helperService;
    constructor(firebaseAdminService: FirebaseAdminService, helperService: DocumentHelperService);
    documentMetadataRef(record: UnknownRecord): FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData, FirebaseFirestore.DocumentData>;
    findDocument(documentId: string): Promise<{
        ref: FirebaseFirestore.DocumentReference;
        snap: FirebaseFirestore.DocumentSnapshot;
    } | null>;
    getApartment(apartmentId: string): Promise<UnknownRecord>;
    getBuilding(buildingId: string): Promise<UnknownRecord>;
    resolveCompanyId(data: UnknownRecord, fallback?: string): string;
}
