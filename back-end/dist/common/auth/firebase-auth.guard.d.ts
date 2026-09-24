import { CanActivate, ExecutionContext } from '@nestjs/common';
import { FirebaseAdminService } from '../infrastructure/firebase/firebase-admin.service';
export declare class FirebaseAuthGuard implements CanActivate {
    private readonly firebaseAdminService;
    private static readonly authCache;
    private static readonly userProfileCache;
    constructor(firebaseAdminService: FirebaseAdminService);
    canActivate(context: ExecutionContext): Promise<boolean>;
    private extractToken;
    private verifyToken;
    private verifyTokenUncached;
    private getUserProfileHydration;
    private getUserProfileHydrationUncached;
}
export declare class OptionalFirebaseAuthGuard extends FirebaseAuthGuard {
    canActivate(context: ExecutionContext): Promise<boolean>;
}
