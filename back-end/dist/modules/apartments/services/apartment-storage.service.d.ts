import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
export declare class ApartmentStorageService {
    private readonly firebaseAdminService;
    private readonly logger;
    constructor(firebaseAdminService: FirebaseAdminService);
    getBuildingStorageFolders(companyId: string, buildingId: string): string[];
    getApartmentStorageFolders(companyId: string, buildingId: string, apartmentId: string): string[];
    getApartmentStorageFolderPath(companyId: string, buildingId: string, apartmentId: string): string;
    resolveApartmentStorageContext(apartmentId: string, data: Record<string, unknown>): {
        companyId: string;
        buildingId: string;
        path: string;
    } | null;
    markStorageFolders(ref: FirebaseFirestore.DocumentReference, folderPaths: string[], entityLabel: string): Promise<void>;
    getStorageFolderSummary(path: string): Promise<{
        path: string;
        fileCount: number;
        hasUserFiles: boolean;
    }>;
    deleteStorageFolder(path: string): Promise<{
        path: string;
        deleted: boolean;
    }>;
}
