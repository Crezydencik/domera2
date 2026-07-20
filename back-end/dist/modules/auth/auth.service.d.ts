import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { AuditLogService } from '../../common/services/audit-log.service';
import { RateLimitService } from '../../common/services/rate-limit.service';
import { FirebaseAdminService } from '../../common/infrastructure/firebase/firebase-admin.service';
import { SetSessionDto } from './dto/set-session.dto';
import { RegisterEmailCodeRequestDto } from './dto/register-email-code-request.dto';
import { RegisterEmailCodeVerifyDto } from './dto/register-email-code-verify.dto';
import { SendPasswordResetDto } from './dto/send-password-reset.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ChangeEmailDto } from './dto/change-email.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ConfirmPasswordResetDto } from './dto/confirm-password-reset.dto';
import { RequestUser } from '../../common/auth/request-user.type';
import { UsersService } from '../users/users.service';
type SessionCookieResult = {
    cookie: string;
    maxAgeSeconds: number;
    userId: string;
    email?: string;
    role?: string;
    accountType?: string;
    companyId?: string;
    apartmentId?: string;
};
export declare class AuthService {
    private readonly firebaseAdminService;
    private readonly configService;
    private readonly rateLimitService;
    private readonly auditLogService;
    private readonly usersService;
    constructor(firebaseAdminService: FirebaseAdminService, configService: ConfigService, rateLimitService: RateLimitService, auditLogService: AuditLogService, usersService: UsersService);
    private normalizeEmail;
    private getConfiguredPlatformAdmins;
    private isConfiguredPlatformAdmin;
    private normalizeLocale;
    private makeDocId;
    private hashCode;
    private hashToken;
    private emailChangeRequestsCollection;
    private validateRegistrationVerification;
    private safeEqual;
    private extractEmailFromFromField;
    private isAllowedSenderDomain;
    private getResendConfig;
    private getRegisterCodeTemplate;
    private getResetPasswordTemplate;
    private buildCustomResetLink;
    private inferAccountTypeFromEmail;
    private createServiceError;
    private getCurrentAuthEmail;
    private buildEmailChangeLink;
    private getEmailChangeTemplate;
    private getFirebaseWebApiKey;
    private callIdentityToolkit;
    private ensureUserProfileDocument;
    private ensureManagementCompanyDocument;
    private getCompanyStorageFolders;
    private ensureCompanyStorageFolders;
    private getSessionTtlMs;
    private createFirebaseSessionCookie;
    private createSessionCookieFromTrustedLogin;
    createSessionCookie(input: SetSessionDto): Promise<SessionCookieResult>;
    requestRegisterEmailCode(request: Request, input: RegisterEmailCodeRequestDto): Promise<{
        success: boolean;
        expiresInSeconds: number;
    }>;
    verifyRegisterEmailCode(request: Request, input: RegisterEmailCodeVerifyDto): Promise<{
        success: boolean;
        verificationToken: `${string}-${string}-${string}-${string}-${string}`;
        expiresInSeconds: number;
    }>;
    loginWithEmailPassword(request: Request, input: LoginDto): Promise<{
        userId: string;
        email: string;
        idToken: string;
        session: SessionCookieResult;
    }>;
    registerWithEmailPassword(request: Request, input: RegisterDto): Promise<{
        userId: string;
        email: string;
        idToken: string;
        session: SessionCookieResult;
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
        session: SessionCookieResult;
    }>;
    previewPasswordReset(request: Request, oobCode: string): Promise<{
        email: string;
    }>;
    confirmPasswordReset(request: Request, input: ConfirmPasswordResetDto): Promise<{
        success: boolean;
    }>;
    sendPasswordReset(request: Request, input: SendPasswordResetDto): Promise<{
        success: boolean;
        message: string;
    }>;
}
export {};
