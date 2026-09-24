import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { AuditLogService } from '../../../common/services/audit-log.service';
import { RateLimitService } from '../../../common/services/rate-limit.service';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { ConfirmPasswordResetDto } from '../dto/confirm-password-reset.dto';
import { SendPasswordResetDto } from '../dto/send-password-reset.dto';
import { AuthEmailService } from './auth-email.service';
import { FirebaseIdentityToolkitService } from './firebase-identity-toolkit.service';
export declare class AuthPasswordResetService {
    private readonly firebaseAdminService;
    private readonly configService;
    private readonly rateLimitService;
    private readonly auditLogService;
    private readonly authEmailService;
    private readonly identityToolkitService;
    constructor(firebaseAdminService: FirebaseAdminService, configService: ConfigService, rateLimitService: RateLimitService, auditLogService: AuditLogService, authEmailService: AuthEmailService, identityToolkitService: FirebaseIdentityToolkitService);
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
    private normalizeEmail;
    private buildCustomResetLink;
    private resolvePasswordResetLanguage;
}
