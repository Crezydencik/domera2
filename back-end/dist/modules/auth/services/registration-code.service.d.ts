import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { AuditLogService } from '../../../common/services/audit-log.service';
import { RateLimitService } from '../../../common/services/rate-limit.service';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { RegisterEmailCodeRequestDto } from '../dto/register-email-code-request.dto';
import { RegisterEmailCodeVerifyDto } from '../dto/register-email-code-verify.dto';
import { AuthEmailService } from './auth-email.service';
export declare class RegistrationCodeService {
    private readonly firebaseAdminService;
    private readonly configService;
    private readonly rateLimitService;
    private readonly auditLogService;
    private readonly authEmailService;
    constructor(firebaseAdminService: FirebaseAdminService, configService: ConfigService, rateLimitService: RateLimitService, auditLogService: AuditLogService, authEmailService: AuthEmailService);
    request(request: Request, input: RegisterEmailCodeRequestDto): Promise<{
        success: boolean;
        expiresInSeconds: number;
    }>;
    verify(request: Request, input: RegisterEmailCodeVerifyDto): Promise<{
        success: boolean;
        verificationToken: string;
        expiresInSeconds: number;
    }>;
    consumeRegistrationVerification(email: string, verificationToken: string): Promise<{
        docRef: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData, FirebaseFirestore.DocumentData>;
    }>;
    private normalizeEmail;
    private normalizeLocale;
    private makeDocId;
    private hashCode;
    private hashToken;
    private generateSecureToken;
    private safeEqual;
    private throwRateLimit;
    private throwServiceError;
}
