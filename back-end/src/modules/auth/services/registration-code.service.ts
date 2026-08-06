import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { AuditLogService } from '../../../common/services/audit-log.service';
import { RateLimitService } from '../../../common/services/rate-limit.service';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { RegisterEmailCodeRequestDto } from '../dto/register-email-code-request.dto';
import { RegisterEmailCodeVerifyDto } from '../dto/register-email-code-verify.dto';
import { AuthEmailService } from './auth-email.service';

const CODE_TTL_MS = 10 * 60 * 1000;
const TOKEN_TTL_MS = 30 * 60 * 1000;
const MAX_ATTEMPTS = 6;
const COLLECTION = 'registration_email_codes';

type LocalizedLocale = 'en' | 'ru' | 'lv';

@Injectable()
export class RegistrationCodeService {
  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly configService: ConfigService,
    private readonly rateLimitService: RateLimitService,
    private readonly auditLogService: AuditLogService,
    private readonly authEmailService: AuthEmailService,
  ) {}

  async request(request: Request, input: RegisterEmailCodeRequestDto) {
    const email = this.normalizeEmail(input.email ?? '');
    const locale = this.normalizeLocale(input.locale);

    const rl = await this.rateLimitService.consume(
      this.rateLimitService.buildKey(request, 'auth:register-code:request', email || 'anon'),
      5,
      60_000,
    );

    if (!rl.allowed) {
      this.throwRateLimit(rl.resetAt);
    }

    try {
      await this.firebaseAdminService.auth.getUserByEmail(email);
      const error = new Error('Email already exists');
      (error as Error & { statusCode?: number }).statusCode = 409;
      throw error;
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode === 409) throw error;
    }

    const code = String(randomInt(100000, 1000000));
    const now = Date.now();
    const expiresAt = now + CODE_TTL_MS;
    const db = this.firebaseAdminService.firestore;

    await db.collection(COLLECTION).doc(this.makeDocId(email)).set({
      email,
      codeHash: this.hashCode(email, code),
      verified: false,
      attempts: 0,
      locale,
      createdAt: new Date(now),
      updatedAt: new Date(now),
      expiresAt: new Date(expiresAt),
    });

    const { errorMessage } = await this.authEmailService.sendRegistrationCode(email, locale, code);
    if (errorMessage) {
      throw new Error(`Resend error: ${errorMessage}`);
    }

    void this.auditLogService.write({
      request,
      action: 'auth.register_code.request',
      status: 'success',
      targetEmail: email,
      metadata: { locale },
    });

    return { success: true, expiresInSeconds: CODE_TTL_MS / 1000 };
  }

  async verify(request: Request, input: RegisterEmailCodeVerifyDto) {
    const email = this.normalizeEmail(input.email ?? '');
    const code = String(input.code ?? '').trim();

    const rl = await this.rateLimitService.consume(
      this.rateLimitService.buildKey(request, 'auth:register-code:verify', email || 'anon'),
      10,
      60_000,
    );

    if (!rl.allowed) {
      this.throwRateLimit(rl.resetAt);
    }

    const db = this.firebaseAdminService.firestore;
    const docRef = db.collection(COLLECTION).doc(this.makeDocId(email));
    const snap = await docRef.get();

    if (!snap.exists) {
      this.throwServiceError('Code not found', 404);
    }

    const data = snap.data() as {
      codeHash: string;
      attempts?: number;
      expiresAt?: FirebaseFirestore.Timestamp;
    };

    const now = Date.now();
    const expiresAtMs = data?.expiresAt?.toMillis?.() ?? 0;
    const attempts = typeof data?.attempts === 'number' ? data.attempts : 0;

    if (!expiresAtMs || now > expiresAtMs) {
      await docRef.delete();
      this.throwServiceError('Code expired', 410);
    }

    if (attempts >= MAX_ATTEMPTS) {
      this.throwServiceError('Too many invalid attempts', 429);
    }

    const expectedHash = this.hashCode(email, code);
    if (!this.safeEqual(expectedHash, data.codeHash)) {
      await docRef.update({ attempts: attempts + 1, updatedAt: new Date(now) });
      this.throwServiceError('Invalid code', 400);
    }

    const verificationToken = this.generateSecureToken();
    const tokenExpiresAt = now + TOKEN_TTL_MS;

    await docRef.update({
      verified: true,
      verifiedAt: new Date(now),
      codeHash: FieldValue.delete(),
      attempts: FieldValue.delete(),
      verificationTokenHash: this.hashToken(verificationToken),
      tokenExpiresAt: new Date(tokenExpiresAt),
      updatedAt: new Date(now),
    });

    void this.auditLogService.write({
      request,
      action: 'auth.register_code.verify',
      status: 'success',
      targetEmail: email,
    });

    return {
      success: true,
      verificationToken,
      expiresInSeconds: TOKEN_TTL_MS / 1000,
    };
  }

  async consumeRegistrationVerification(email: string, verificationToken: string) {
    const db = this.firebaseAdminService.firestore;
    const docRef = db.collection(COLLECTION).doc(this.makeDocId(email));
    const snap = await docRef.get();

    if (!snap.exists) {
      this.throwServiceError('Email confirmation is required before registration', 400);
    }

    const data = snap.data() as {
      verified?: boolean;
      verificationTokenHash?: string;
      tokenExpiresAt?: FirebaseFirestore.Timestamp;
    };

    if (!data?.verified || !data.verificationTokenHash) {
      this.throwServiceError('Email confirmation is required before registration', 400);
    }

    const tokenExpiresAtMs = data.tokenExpiresAt?.toMillis?.() ?? 0;
    if (!tokenExpiresAtMs || Date.now() > tokenExpiresAtMs) {
      await docRef.delete();
      this.throwServiceError('Email confirmation expired. Please request a new code.', 410);
    }

    const tokenHash = this.hashToken(String(verificationToken ?? ''));
    if (!this.safeEqual(tokenHash, data.verificationTokenHash)) {
      this.throwServiceError('Invalid email confirmation token', 400);
    }

    return { docRef };
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private normalizeLocale(locale?: string): LocalizedLocale {
    if (!locale) return 'en';
    const code = locale.slice(0, 2).toLowerCase();
    if (code === 'ru' || code === 'lv') return code;
    return 'en';
  }

  private makeDocId(email: string): string {
    return createHash('sha256').update(email).digest('hex');
  }

  private hashCode(email: string, code: string): string {
    const secret = this.configService.getOrThrow<string>('REGISTRATION_CODE_SECRET');
    return createHmac('sha256', secret).update(`${email}:${code}`).digest('hex');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private generateSecureToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private safeEqual(a: string, b: string): boolean {
    const buffA = Buffer.from(a);
    const buffB = Buffer.from(b);
    if (buffA.length !== buffB.length) return false;
    return timingSafeEqual(buffA, buffB);
  }

  private throwRateLimit(resetAt: number): never {
    const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
    const error = new Error('Too many requests');
    (error as Error & { statusCode?: number; retryAfter?: number }).statusCode = 429;
    (error as Error & { statusCode?: number; retryAfter?: number }).retryAfter = retryAfter;
    throw error;
  }

  private throwServiceError(message: string, statusCode: number): never {
    const error = new Error(message) as Error & { statusCode?: number };
    error.statusCode = statusCode;
    throw error;
  }
}
