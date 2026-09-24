import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
export declare const DELETED_BUILDING_STORAGE_RETENTION_DAYS = 180;
export type BuildingDeleteBackupResult = {
    backupStoragePath: string | null;
    backupStoragePrefix: string | null;
    retainedStoragePrefix: string | null;
    retentionExpiresAt: Date;
    copiedStorageFilesCount: number;
    backupFailed?: boolean;
    backupError?: string;
};
export declare class BuildingStorageService {
    private readonly firebaseAdminService;
    constructor(firebaseAdminService: FirebaseAdminService);
    getCompanyStorageFolders(companyId: string): string[];
    getBuildingStorageFolders(companyId: string, buildingId: string): string[];
    getRetentionExpiresAt(deletedAt: Date): Date;
    markStorageFolders(ref: FirebaseFirestore.DocumentReference, folderPaths: string[], entityLabel: string): Promise<void>;
    backupBuildingBeforeDelete(params: {
        buildingId: string;
        companyId: string;
        building: Record<string, unknown>;
        deletedBy: string;
        deletedAt: Date;
    }): Promise<BuildingDeleteBackupResult>;
    private sanitizePathSegment;
    private addDays;
    private toBackupJson;
    private queryBuildingBackupDocs;
    private getBuildingSubcollectionBackup;
}
