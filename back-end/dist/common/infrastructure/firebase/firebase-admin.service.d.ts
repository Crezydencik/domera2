import { ConfigService } from '@nestjs/config';
export declare class FirebaseAdminService {
    private readonly configService;
    private app?;
    constructor(configService: ConfigService);
    get auth(): import("firebase-admin/auth").Auth;
    get firestore(): FirebaseFirestore.Firestore;
    private getApp;
    private initApp;
}
