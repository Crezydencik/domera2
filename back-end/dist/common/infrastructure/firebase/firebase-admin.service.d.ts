import { ConfigService } from '@nestjs/config';
export declare class FirebaseAdminService {
    private readonly configService;
    private app?;
    constructor(configService: ConfigService);
    get auth(): import("firebase-admin/auth").Auth;
    get firestore(): FirebaseFirestore.Firestore;
    get storage(): import("firebase-admin/storage").Storage;
    private getBucketName;
    get storageBucket(): import("@google-cloud/storage").Bucket;
    createStorageFolder(folderPath: string): Promise<void>;
    createStorageFolders(folderPaths: string[]): Promise<void>;
    getStorageFolderSummary(folderPath: string): Promise<{
        path: string;
        fileCount: number;
        hasUserFiles: boolean;
    }>;
    deleteStorageFolder(folderPath: string): Promise<{
        path: string;
        deleted: boolean;
    }>;
    private getApp;
    private initApp;
}
