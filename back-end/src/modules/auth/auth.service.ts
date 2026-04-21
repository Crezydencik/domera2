import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { Resend } from 'resend';
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
import { normalizeUserRole, resolveAccountType } from '../../common/auth/role.constants';

const CODE_TTL_MS = 60 * 60 * 1000;
const TOKEN_TTL_MS = 60 * 60 * 1000;
const MAX_ATTEMPTS = 6;
const COLLECTION = 'registration_email_codes';

type LocalizedLocale = 'en' | 'ru' | 'lv';

@Injectable()
export class AuthService {
  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly configService: ConfigService,
    private readonly rateLimitService: RateLimitService,
    private readonly auditLogService: AuditLogService,
  ) {}

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
    const secret = this.configService.get<string>('REGISTRATION_CODE_SECRET') ?? '';
    return createHash('sha256').update(`${email}:${code}:${secret}`).digest('hex');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private safeEqual(a: string, b: string): boolean {
    const buffA = Buffer.from(a);
    const buffB = Buffer.from(b);
    if (buffA.length !== buffB.length) return false;
    return timingSafeEqual(buffA, buffB);
  }

  private extractEmailFromFromField(from: string): string {
    const trimmed = from.trim();
    const angleBracketMatch = trimmed.match(/<([^>]+)>/);
    return (angleBracketMatch?.[1] ?? trimmed).trim().toLowerCase();
  }

  private isAllowedSenderDomain(from: string, allowedDomain: string): boolean {
    const email = this.extractEmailFromFromField(from);
    const atIndex = email.lastIndexOf('@');
    if (atIndex === -1) return false;
    const domain = email.slice(atIndex + 1);
    return domain === allowedDomain.toLowerCase();
  }

  private getResendConfig(): { apiKey: string; from: string } {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    const from = this.configService.get<string>('RESEND_FROM');
    const allowedDomain = this.configService.get<string>('RESEND_ALLOWED_DOMAIN') ?? 'lumtach.com';

    if (!apiKey || !from) {
      throw new Error('Resend is not configured. Please set RESEND_API_KEY and RESEND_FROM');
    }

    if (!this.isAllowedSenderDomain(from, allowedDomain)) {
      throw new Error(`Invalid RESEND_FROM: sender domain must be ${allowedDomain}`);
    }

    return { apiKey, from };
  }

  private getRegisterCodeTemplate(locale: LocalizedLocale, code: string): { subject: string; html: string } {
    if (locale === 'ru') {
      return {
        subject: 'Код подтверждения регистрации Domera',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">
            <h2 style="margin:0 0 12px;">Подтверждение регистрации</h2>
            <p style="margin:0 0 12px;">Введите этот код на странице регистрации:</p>
            <div style="font-size:34px;font-weight:700;letter-spacing:6px;background:#eef2ff;border:1px solid #c7d2fe;border-radius:10px;padding:14px 18px;display:inline-block;">${code}</div>
            <p style="margin:14px 0 0;color:#334155;">Код действителен в течение 1 часа.</p>
          </div>
        `,
      };
    }

    if (locale === 'lv') {
      return {
        subject: 'Domera reģistrācijas apstiprināšanas kods',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">
            <h2 style="margin:0 0 12px;">Reģistrācijas apstiprināšana</h2>
            <p style="margin:0 0 12px;">Ievadiet šo kodu reģistrācijas lapā:</p>
            <div style="font-size:34px;font-weight:700;letter-spacing:6px;background:#eef2ff;border:1px solid #c7d2fe;border-radius:10px;padding:14px 18px;display:inline-block;">${code}</div>
            <p style="margin:14px 0 0;color:#334155;">Kods ir derīgs 1 stundu.</p>
          </div>
        `,
      };
    }

    return {
      subject: 'Domera registration verification code',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">
          <h2 style="margin:0 0 12px;">Confirm your registration</h2>
          <p style="margin:0 0 12px;">Enter this code on the registration page:</p>
          <div style="font-size:34px;font-weight:700;letter-spacing:6px;background:#eef2ff;border:1px solid #c7d2fe;border-radius:10px;padding:14px 18px;display:inline-block;">${code}</div>
          <p style="margin:14px 0 0;color:#334155;">This code is valid for 1 hour.</p>
        </div>
      `,
    };
  }

  private getResetPasswordTemplate(lang: 'ru' | 'lv', resetLink: string): { subject: string; html: string } {
    if (lang === 'ru') {
      return {
        subject: 'Сброс пароля Domera',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">
            <h2 style="margin:0 0 12px;">Сброс пароля</h2>
            <p style="margin:0 0 12px;">Нажмите кнопку ниже, чтобы создать новый пароль:</p>
            <a href="${resetLink}" style="display:inline-block;padding:12px 18px;background:#4f46e5;color:#ffffff;text-decoration:none;border-radius:8px;">Сбросить пароль</a>
            <p style="margin:14px 0 0;color:#64748b;font-size:13px;">Если вы не запрашивали сброс, просто игнорируйте это письмо.</p>
          </div>
        `,
      };
    }

    return {
      subject: 'Domera paroles atiestatīšana',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">
          <h2 style="margin:0 0 12px;">Paroles atiestatīšana</h2>
          <p style="margin:0 0 12px;">Nospiediet pogu zemāk, lai izveidotu jaunu paroli:</p>
          <a href="${resetLink}" style="display:inline-block;padding:12px 18px;background:#4f46e5;color:#ffffff;text-decoration:none;border-radius:8px;">Atiestatīt paroli</a>
          <p style="margin:14px 0 0;color:#64748b;font-size:13px;">Ja neesat pieprasījis atiestatīšanu, ignorējiet šo e-pastu.</p>
        </div>
      `,
    };
  }

  private buildCustomResetLink(origin: string, firebaseResetLink: string, email?: string): string {
    const parsed = new URL(firebaseResetLink);
    const oobCode = parsed.searchParams.get('oobCode');

    if (!oobCode) {
      throw new Error('Failed to build password reset link');
    }

    const customUrl = new URL('/reset-password/confirm', origin);
    customUrl.searchParams.set('oobCode', oobCode);

    if (email?.trim()) {
      customUrl.searchParams.set('email', this.normalizeEmail(email));
    }

    return customUrl.toString();
  }

  private inferAccountTypeFromEmail(email: string): 'ManagementCompany' | 'Resident' | 'Landlord' {
    const normalized = email.toLowerCase();

    if (normalized.includes('landlord') || normalized.includes('owner')) {
      return 'Landlord';
    }

    if (normalized.includes('resident') || normalized.includes('tenant') || normalized.includes('renter')) {
      return 'Resident';
    }

    return 'ManagementCompany';
  }

  private createServiceError(message: string, statusCode: number): Error & { statusCode?: number } {
    const error = new Error(message) as Error & { statusCode?: number };
    error.statusCode = statusCode;
    return error;
  }

  private getFirebaseWebApiKey(): string {
    return (
      this.configService.get<string>('FIREBASE_WEB_API_KEY')?.trim() ||
      this.configService.get<string>('NEXT_PUBLIC_FIREBASE_API_KEY')?.trim() ||
      ''
    );
  }

  private async callIdentityToolkit<T>(
    endpoint: string,
    payload: Record<string, unknown>,
  ): Promise<T> {
    const apiKey = this.getFirebaseWebApiKey();

    if (!apiKey) {
      throw this.createServiceError(
        'Firebase Web API key is missing in the backend environment. Set FIREBASE_WEB_API_KEY.',
        500,
      );
    }

    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${endpoint}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const json = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    } & T;

    if (!response.ok) {
      const providerMessage = String(json.error?.message ?? '').toUpperCase();

      if (
        providerMessage.includes('INVALID_LOGIN_CREDENTIALS') ||
        providerMessage.includes('INVALID_PASSWORD')
      ) {
        throw this.createServiceError('Incorrect email or password', 401);
      }

      if (providerMessage.includes('EMAIL_NOT_FOUND') || providerMessage.includes('USER_NOT_FOUND')) {
        throw this.createServiceError('User account was not found', 404);
      }

      if (providerMessage.includes('EMAIL_EXISTS')) {
        throw this.createServiceError('This email is already registered', 409);
      }

      if (
        providerMessage.includes('WEAK_PASSWORD') ||
        providerMessage.includes('INVALID_EMAIL') ||
        providerMessage.includes('MISSING_EMAIL') ||
        providerMessage.includes('MISSING_PASSWORD') ||
        providerMessage.includes('INVALID_OOB_CODE')
      ) {
        throw this.createServiceError('Invalid authentication request', 400);
      }

      throw this.createServiceError('Firebase authentication request failed', 400);
    }

    return json;
  }

  private async ensureUserProfileDocument(input: {
    uid: string;
    email: string;
    accountType?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    companyName?: string;
    registrationNumber?: string;
    apartmentId?: string;
  }) {
    const ref = this.firebaseAdminService.firestore.collection('users').doc(input.uid);
    const snap = await ref.get();
    const current = snap.exists ? (snap.data() as Record<string, unknown>) : {};

    const accountType =
      resolveAccountType({ role: current.role, accountType: input.accountType ?? current.accountType }) ??
      this.inferAccountTypeFromEmail(input.email);
    const role = normalizeUserRole(current.role ?? accountType) ?? accountType;

    const firstName =
      (typeof input.firstName === 'string' && input.firstName.trim()) ||
      (typeof current.firstName === 'string' ? current.firstName : undefined);
    const lastName =
      (typeof input.lastName === 'string' && input.lastName.trim()) ||
      (typeof current.lastName === 'string' ? current.lastName : undefined);
    const fullName =
      [firstName, lastName].filter((value): value is string => Boolean(value)).join(' ').trim() ||
      (typeof current.fullName === 'string' ? current.fullName : undefined);
    const phone =
      (typeof input.phone === 'string' && input.phone.trim()) ||
      (typeof current.phone === 'string' ? current.phone : undefined);
    const companyId =
      (typeof current.companyId === 'string' && current.companyId.trim()) ||
      (accountType === 'ManagementCompany' ? input.uid : undefined);
    const apartmentId =
      (typeof input.apartmentId === 'string' && input.apartmentId.trim()) ||
      (typeof current.apartmentId === 'string' ? current.apartmentId : undefined);

    const nextData = Object.fromEntries(
      Object.entries({
        ...current,
        uid: input.uid,
        email: input.email,
        role,
        accountType,
        companyId,
        apartmentId,
        firstName,
        lastName,
        fullName,
        phone,
        companyName:
          (typeof input.companyName === 'string' && input.companyName.trim()) ||
          (typeof current.companyName === 'string' ? current.companyName : undefined),
        registrationNumber:
          (typeof input.registrationNumber === 'string' && input.registrationNumber.trim()) ||
          (typeof current.registrationNumber === 'string' ? current.registrationNumber : undefined),
        createdAt: current.createdAt ?? new Date(),
        updatedAt: new Date(),
      }).filter(([, value]) => value !== undefined && value !== ''),
    );

    await ref.set(nextData, { merge: true });
    return nextData as Record<string, unknown>;
  }

  async createSessionCookie(input: SetSessionDto): Promise<{
    cookie: string;
    maxAgeSeconds: number;
    role?: string;
    accountType?: string;
    companyId?: string;
    apartmentId?: string;
  }> {
    const decoded = await this.firebaseAdminService.auth.verifyIdToken(input.idToken, true);

    if (input.userId && input.userId !== decoded.uid) {
      throw new Error('userId does not match token subject');
    }

    if (input.email && decoded.email && input.email.toLowerCase() !== decoded.email.toLowerCase()) {
      throw new Error('email does not match token subject');
    }

    let role = normalizeUserRole(decoded.role);
    let accountType = resolveAccountType({ role, accountType: decoded.accountType });
    let companyId = typeof decoded.companyId === 'string' ? decoded.companyId : undefined;
    let apartmentId = typeof decoded.apartmentId === 'string' ? decoded.apartmentId : undefined;

    if (!role || !accountType || !companyId || !apartmentId) {
      try {
        const userDoc = await this.firebaseAdminService.firestore.collection('users').doc(decoded.uid).get();
        if (userDoc.exists) {
          const userData = userDoc.data() as Record<string, unknown>;
          role = role ?? normalizeUserRole(userData.role ?? userData.accountType);
          accountType = accountType ?? resolveAccountType({
            role: userData.role,
            accountType: userData.accountType,
          });
          companyId = companyId ?? (typeof userData.companyId === 'string' ? userData.companyId : undefined);
          apartmentId = apartmentId ?? (typeof userData.apartmentId === 'string' ? userData.apartmentId : undefined);
        }
      } catch {
        // keep verified token data if profile hydration is unavailable
      }
    }

    const ttlMinutes = Number(this.configService.get<string>('FIREBASE_SESSION_TTL_MINUTES') ?? '30');
    const ttlMs = Math.min(Math.max(ttlMinutes, 5), 24 * 60) * 60 * 1000;
    const sessionCookie = await this.firebaseAdminService.auth.createSessionCookie(input.idToken, {
      expiresIn: ttlMs,
    });

    return {
      cookie: sessionCookie,
      maxAgeSeconds: Math.floor(ttlMs / 1000),
      role,
      accountType,
      companyId,
      apartmentId,
    };
  }

  async requestRegisterEmailCode(request: Request, input: RegisterEmailCodeRequestDto) {
    const email = this.normalizeEmail(input.email ?? '');
    const locale = this.normalizeLocale(input.locale);

    const rl = await this.rateLimitService.consume(
      this.rateLimitService.buildKey(request, 'auth:register-code:request', email || 'anon'),
      5,
      60_000,
    );

    if (!rl.allowed) {
      const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
      const error = new Error('Too many requests');
      (error as Error & { statusCode?: number; retryAfter?: number }).statusCode = 429;
      (error as Error & { statusCode?: number; retryAfter?: number }).retryAfter = retryAfter;
      throw error;
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

    const resendConfig = this.getResendConfig();
    const resend = new Resend(resendConfig.apiKey);
    const template = this.getRegisterCodeTemplate(locale, code);

    const { error: resendError } = await resend.emails.send({
      from: resendConfig.from,
      to: email,
      subject: template.subject,
      html: template.html,
    });

    if (resendError) {
      throw new Error(`Resend error: ${resendError.message}`);
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

  async verifyRegisterEmailCode(request: Request, input: RegisterEmailCodeVerifyDto) {
    const email = this.normalizeEmail(input.email ?? '');
    const code = String(input.code ?? '').trim();

    const rl = await this.rateLimitService.consume(
      this.rateLimitService.buildKey(request, 'auth:register-code:verify', email || 'anon'),
      10,
      60_000,
    );

    if (!rl.allowed) {
      const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
      const error = new Error('Too many requests');
      (error as Error & { statusCode?: number; retryAfter?: number }).statusCode = 429;
      (error as Error & { statusCode?: number; retryAfter?: number }).retryAfter = retryAfter;
      throw error;
    }

    const db = this.firebaseAdminService.firestore;
    const docRef = db.collection(COLLECTION).doc(this.makeDocId(email));
    const snap = await docRef.get();

    if (!snap.exists) {
      const error = new Error('Code not found');
      (error as Error & { statusCode?: number }).statusCode = 404;
      throw error;
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
      const error = new Error('Code expired');
      (error as Error & { statusCode?: number }).statusCode = 410;
      throw error;
    }

    if (attempts >= MAX_ATTEMPTS) {
      const error = new Error('Too many invalid attempts');
      (error as Error & { statusCode?: number }).statusCode = 429;
      throw error;
    }

    const expectedHash = this.hashCode(email, code);
    if (!this.safeEqual(expectedHash, data.codeHash)) {
      await docRef.update({ attempts: attempts + 1, updatedAt: new Date(now) });
      const error = new Error('Invalid code');
      (error as Error & { statusCode?: number }).statusCode = 400;
      throw error;
    }

    const verificationToken = randomUUID();
    const tokenExpiresAt = now + TOKEN_TTL_MS;

    await docRef.update({
      verified: true,
      verifiedAt: new Date(now),
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

  async loginWithEmailPassword(request: Request, input: LoginDto) {
    const email = this.normalizeEmail(input.email ?? '');

    const authResult = await this.callIdentityToolkit<{
      idToken: string;
      localId: string;
      email?: string;
    }>('signInWithPassword', {
      email,
      password: input.password,
      returnSecureToken: true,
    });

    await this.ensureUserProfileDocument({
      uid: authResult.localId,
      email: authResult.email ?? email,
    });

    const session = await this.createSessionCookie({
      idToken: authResult.idToken,
      userId: authResult.localId,
      email: authResult.email ?? email,
    });

    void this.auditLogService.write({
      request,
      action: 'auth.login',
      status: 'success',
      targetEmail: email,
      metadata: { rememberMe: Boolean(input.rememberMe) },
    });

    return {
      userId: authResult.localId,
      email: authResult.email ?? email,
      session,
    };
  }

  async registerWithEmailPassword(request: Request, input: RegisterDto) {
    const email = this.normalizeEmail(input.email ?? '');
    const accountType = resolveAccountType({ accountType: input.accountType }) ?? 'Resident';
    const fullName = [input.firstName?.trim(), input.lastName?.trim()]
      .filter((value): value is string => Boolean(value))
      .join(' ')
      .trim();

    let uid: string;

    try {
      const created = await this.firebaseAdminService.auth.createUser({
        email,
        password: input.password,
        displayName: fullName || undefined,
      });
      uid = created.uid;
    } catch (error) {
      const code = (error as { code?: string } | undefined)?.code;
      if (code === 'auth/email-already-exists') {
        throw this.createServiceError('This email is already registered', 409);
      }
      if (code === 'auth/invalid-password' || code === 'auth/invalid-email') {
        throw this.createServiceError('Invalid registration request', 400);
      }
      throw error;
    }

    await this.ensureUserProfileDocument({
      uid,
      email,
      accountType,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      companyName: input.companyName,
      registrationNumber: input.registrationNumber,
    });

    const authResult = await this.callIdentityToolkit<{
      idToken: string;
      localId: string;
      email?: string;
    }>('signInWithPassword', {
      email,
      password: input.password,
      returnSecureToken: true,
    });

    const session = await this.createSessionCookie({
      idToken: authResult.idToken,
      userId: uid,
      email,
    });

    void this.auditLogService.write({
      request,
      action: 'auth.register',
      status: 'success',
      targetEmail: email,
      metadata: { accountType },
    });

    return {
      userId: uid,
      email,
      session,
    };
  }

  async previewPasswordReset(request: Request, oobCode: string) {
    const result = await this.callIdentityToolkit<{ email?: string }>('resetPassword', {
      oobCode,
    });

    void this.auditLogService.write({
      request,
      action: 'auth.password_reset_preview',
      status: 'success',
      targetEmail: result.email,
    });

    return {
      email: result.email ? this.normalizeEmail(result.email) : '',
    };
  }

  async confirmPasswordReset(request: Request, input: ConfirmPasswordResetDto) {
    await this.callIdentityToolkit('resetPassword', {
      oobCode: input.oobCode,
      newPassword: input.newPassword,
    });

    void this.auditLogService.write({
      request,
      action: 'auth.password_reset_confirm',
      status: 'success',
    });

    return { success: true };
  }

  async sendPasswordReset(request: Request, input: SendPasswordResetDto) {
    const email = this.normalizeEmail(input.email ?? '');

    try {
      const rl = await this.rateLimitService.consume(
        this.rateLimitService.buildKey(request, 'auth:password-reset', email || 'anon'),
        6,
        60_000,
      );

      if (!rl.allowed) {
        const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
        const error = new Error('Too many requests');
        (error as Error & { statusCode?: number; retryAfter?: number }).statusCode = 429;
        (error as Error & { statusCode?: number; retryAfter?: number }).retryAfter = retryAfter;
        throw error;
      }
    } catch (error) {
      if ((error as { statusCode?: number } | undefined)?.statusCode === 429) {
        throw error;
      }

      void this.auditLogService.write({
        request,
        action: 'auth.password_reset_send',
        status: 'error',
        targetEmail: email,
        metadata: {
          skipped: 'rate-limit-unavailable',
          providerMessage: error instanceof Error ? error.message : 'unknown',
        },
      });
    }

    const configuredAppUrl = this.configService.get<string>('APP_URL')?.trim();
    const host = request.get('host') ?? 'localhost:3000';
    const forwardedProto = request.get('x-forwarded-proto');
    const protocol = forwardedProto ?? request.protocol ?? 'http';
    const requestOrigin = `${protocol}://${host}`;
    const origin = configuredAppUrl || requestOrigin;

    let firebaseResetLink: string;

    try {
      firebaseResetLink = await this.firebaseAdminService.auth.generatePasswordResetLink(email);
    } catch (error) {
      const code = (error as { code?: string } | undefined)?.code;

      void this.auditLogService.write({
        request,
        action: 'auth.password_reset_send',
        status: 'success',
        targetEmail: email,
        metadata: {
          skipped: code === 'auth/user-not-found' ? 'user-not-found' : 'link-generation-failed',
          providerCode: code,
        },
      });

      return { success: true, message: 'Vēstule nosūtīta' };
    }

    let resetLink = firebaseResetLink;
    try {
      resetLink = this.buildCustomResetLink(origin, firebaseResetLink, email);
    } catch {
      resetLink = firebaseResetLink;
    }

    let lang: 'ru' | 'lv' = 'lv';
    try {
      const usersSnap = await this.firebaseAdminService.firestore
        .collection('users')
        .where('email', '==', email)
        .limit(1)
        .get();
      const preferredLang = usersSnap.empty
        ? undefined
        : (usersSnap.docs[0].data().preferredLang as string | undefined);
      lang = preferredLang === 'ru' ? 'ru' : 'lv';
    } catch {
      lang = 'lv';
    }

    try {
      const resendConfig = this.getResendConfig();
      const resend = new Resend(resendConfig.apiKey);
      const template = this.getResetPasswordTemplate(lang, resetLink);
      const { error: resendError } = await resend.emails.send({
        from: resendConfig.from,
        to: email,
        subject: template.subject,
        html: template.html,
      });

      if (resendError) {
        void this.auditLogService.write({
          request,
          action: 'auth.password_reset_send',
          status: 'success',
          targetEmail: email,
          metadata: { skipped: 'resend-error', providerMessage: resendError.message, lang },
        });

        return { success: true, message: 'Vēstule nosūtīta' };
      }
    } catch (error) {
      void this.auditLogService.write({
        request,
        action: 'auth.password_reset_send',
        status: 'success',
        targetEmail: email,
        metadata: {
          skipped: 'resend-exception',
          providerMessage: error instanceof Error ? error.message : 'unknown',
          lang,
        },
      });

      return { success: true, message: 'Vēstule nosūtīta' };
    }

    void this.auditLogService.write({
      request,
      action: 'auth.password_reset_send',
      status: 'success',
      targetEmail: email,
      metadata: { lang },
    });

    return { success: true, message: 'Vēstule nosūtīta' };
  }
}
