import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
export declare class CompanyStorageService {
    private readonly firebaseAdminService;
    constructor(firebaseAdminService: FirebaseAdminService);
    getCompanyStorageFolders(companyId: string): string[];
    markStorageFolders(ref: FirebaseFirestore.DocumentReference, folderPaths: string[]): Promise<void>;
}
