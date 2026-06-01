import { CanActivate, ExecutionContext } from '@nestjs/common';
import { FirebaseAuthGuard } from '../../common/auth/firebase-auth.guard';
import { FirebaseAdminService } from '../../common/infrastructure/firebase/firebase-admin.service';
export declare class InvoiceUploadAuthGuard implements CanActivate {
    private readonly firebaseAdminService;
    private readonly firebaseAuthGuard;
    constructor(firebaseAdminService: FirebaseAdminService, firebaseAuthGuard: FirebaseAuthGuard);
    canActivate(context: ExecutionContext): Promise<boolean>;
    private firstHeader;
    private extractApiKey;
    private hashApiKey;
    private safeEquals;
    private resolveEnvApiKey;
    private timestampToMillis;
    private validateApiKeyData;
    private resolveFirestoreApiKey;
    private resolveApiKey;
}
