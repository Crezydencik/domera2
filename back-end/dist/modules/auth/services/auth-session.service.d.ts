import { ConfigService } from '@nestjs/config';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { SetSessionDto } from '../dto/set-session.dto';
import { AuthSessionResult } from '../types/auth-session.types';
import { AuthProfileProvisioningService } from './auth-profile-provisioning.service';
export declare class AuthSessionService {
    private readonly firebaseAdminService;
    private readonly configService;
    private readonly profileProvisioningService;
    constructor(firebaseAdminService: FirebaseAdminService, configService: ConfigService, profileProvisioningService: AuthProfileProvisioningService);
    createSessionCookieFromTrustedLogin(input: {
        idToken: string;
        userId: string;
        email?: string;
        rememberMe?: boolean;
        profile?: Record<string, unknown>;
    }): Promise<AuthSessionResult>;
    createSessionCookie(input: SetSessionDto): Promise<AuthSessionResult>;
    private normalizeEmail;
    private getSessionTtlMs;
    private createFirebaseSessionCookie;
    private createServiceError;
}
