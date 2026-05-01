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
import { ConfirmPasswordResetDto } from './dto/confirm-password-reset.dto';
export declare class AuthService {
    private readonly firebaseAdminService;
    private readonly configService;
    private readonly rateLimitService;
    private readonly auditLogService;
    constructor(firebaseAdminService: FirebaseAdminService, configService: ConfigService, rateLimitService: RateLimitService, auditLogService: AuditLogService);
    private normalizeEmail;
    private normalizeLocale;
    private makeDocId;
    private hashCode;
    private hashToken;
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
    private getFirebaseWebApiKey;
    private callIdentityToolkit;
    private ensureUserProfileDocument;
    private ensureManagementCompanyDocument;
    createSessionCookie(input: SetSessionDto): Promise<{
        cookie: string;
        maxAgeSeconds: number;
        role?: string;
        accountType?: string;
        companyId?: string;
        apartmentId?: string;
    }>;
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
        session: {
            cookie: string;
            maxAgeSeconds: number;
            role?: string;
            accountType?: string;
            companyId?: string;
            apartmentId?: string;
        };
    }>;
    registerWithEmailPassword(request: Request, input: RegisterDto): Promise<{
        userId: string;
        email: string;
        session: {
            cookie: string;
            maxAgeSeconds: number;
            role?: string;
            accountType?: string;
            companyId?: string;
            apartmentId?: string;
        };
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
