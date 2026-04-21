import { CanActivate, ExecutionContext } from '@nestjs/common';
import { FirebaseAdminService } from '../infrastructure/firebase/firebase-admin.service';
export declare class FirebaseAuthGuard implements CanActivate {
    private readonly firebaseAdminService;
    constructor(firebaseAdminService: FirebaseAdminService);
    canActivate(context: ExecutionContext): Promise<boolean>;
    private extractToken;
}
