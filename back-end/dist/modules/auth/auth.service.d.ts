import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { AuditLogService } from '../../common/services/audit-log.service';
import { RateLimitService } from '../../common/services/rate-limit.service';
import { FirebaseAdminService } from '../../common/infrastructure/firebase/firebase-admin.service';
import { SetSessionDto } from './dto/set-session.dto';
import { RegisterEmailCodeRequestDto } from './dto/register-email-code-request.dto';
import { RegisterEmailCodeVerifyDto } from './dto/register-email-code-verify.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ChangeEmailDto } from './dto/change-email.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RequestUser } from '../../common/auth/request-user.type';
import { UsersService } from '../users/users.service';
import { AuthEmailService } from './services/auth-email.service';
import { AuthProfileProvisioningService } from './services/auth-profile-provisioning.service';
import { AuthSessionService } from './services/auth-session.service';
import { FirebaseIdentityToolkitService } from './services/firebase-identity-toolkit.service';
import { RegistrationCodeService } from './services/registration-code.service';
import { AuthSessionResult } from './types/auth-session.types';
export declare class AuthService {
    private readonly firebaseAdminService;
    private readonly configService;
    private readonly rateLimitService;
    private readonly auditLogService;
    private readonly usersService;
    private readonly registrationCodeService;
    private readonly authEmailService;
    private readonly profileProvisioningService;
    private readonly authSessionService;
    private readonly identityToolkitService;
    constructor(firebaseAdminService: FirebaseAdminService, configService: ConfigService, rateLimitService: RateLimitService, auditLogService: AuditLogService, usersService: UsersService, registrationCodeService: RegistrationCodeService, authEmailService: AuthEmailService, profileProvisioningService: AuthProfileProvisioningService, authSessionService: AuthSessionService, identityToolkitService: FirebaseIdentityToolkitService);
    private normalizeEmail;
    private hashToken;
    private generateSecureToken;
    private emailChangeRequestsCollection;
    private revokePendingEmailChanges;
    private createServiceError;
    private getCurrentAuthEmail;
    private buildEmailChangeLink;
    createSessionCookie(input: SetSessionDto): Promise<AuthSessionResult>;
    requestRegisterEmailCode(request: Request, input: RegisterEmailCodeRequestDto): Promise<{
        success: boolean;
        expiresInSeconds: number;
    }>;
    verifyRegisterEmailCode(request: Request, input: RegisterEmailCodeVerifyDto): Promise<{
        success: boolean;
        verificationToken: string;
        expiresInSeconds: number;
    }>;
    loginWithEmailPassword(request: Request, input: LoginDto): Promise<{
        userId: string;
        email: string;
        idToken: string;
        session: AuthSessionResult;
    }>;
    registerWithEmailPassword(request: Request, input: RegisterDto): Promise<{
        userId: string;
        email: string;
        idToken: string;
        session: AuthSessionResult;
    }>;
    changeEmail(request: Request, user: RequestUser, input: ChangeEmailDto): Promise<{
        success: boolean;
        userId: string;
        email: string;
        verificationRequired: boolean;
        pendingEmail?: undefined;
    } | {
        success: boolean;
        userId: string;
        email: string;
        pendingEmail: string;
        verificationRequired: boolean;
    }>;
    confirmEmailChange(request: Request, token: string): Promise<{
        success: boolean;
        userId: string;
        email: string;
    }>;
    changePassword(request: Request, user: RequestUser, input: ChangePasswordDto): Promise<{
        success: boolean;
        userId: string;
        email: string;
        session: AuthSessionResult;
    }>;
}
