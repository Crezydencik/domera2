import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
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
import { ChangeEmailDto } from './dto/change-email.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ConfirmPasswordResetDto } from './dto/confirm-password-reset.dto';
import {
  isPublicRegistrationRole,
  resolveAccountType,
  resolveUserRole,
} from '../../common/auth/role.constants';
import { RequestUser } from '../../common/auth/request-user.type';
import { UsersService } from '../users/users.service';
import {
  passwordResetTemplates,
  registrationCodeTemplates,
} from '../emails/templates';
import {
  button,
  note,
  paragraph,
  renderEmailLayout,
} from '../emails/templates/email-layout.template';

const CODE_TTL_MS = 60 * 60 * 1000;
const TOKEN_TTL_MS = 60 * 60 * 1000;
const EMAIL_CHANGE_TTL_MS = 60 * 60 * 1000;
const MAX_ATTEMPTS = 6;
const COLLECTION = 'registration_email_codes';
const EMAIL_CHANGE_COLLECTION = 'email_change_requests';

type LocalizedLocale = 'en' | 'ru' | 'lv';

@Injectable()
export class AuthService {
  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly configService: ConfigService,
    private readonly rateLimitService: RateLimitService,
    private readonly auditLogService: AuditLogService,
    private readonly usersService: UsersService,
  ) {}

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private getConfiguredPlatformAdmins() {
    const splitList = (value?: string) =>
      String(value ?? '')
        .split(/[,\s;]+/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);

    return {
      emails: new Set(splitList(this.configService.get<string>('PLATFORM_ADMIN_EMAILS'))),
      uids: new Set(splitList(this.configService.get<string>('PLATFORM_ADMIN_UIDS'))),
    };
  }

  private isConfiguredPlatformAdmin(input: { uid?: string; email?: string }): boolean {
    const { emails, uids } = this.getConfiguredPlatformAdmins();
    const uid = input.uid?.trim().toLowerCase();
    const email = input.email?.trim().toLowerCase();

    return Boolean((uid && uids.has(uid)) || (email && emails.has(email)));
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

  private emailChangeRequestsCollection(uid: string) {
    return this.firebaseAdminService.firestore
      .collection('users')
      .doc(uid)
      .collection(EMAIL_CHANGE_COLLECTION);
  }

  private async validateRegistrationVerification(email: string, verificationToken: string) {
    const db = this.firebaseAdminService.firestore;
    const docRef = db.collection(COLLECTION).doc(this.makeDocId(email));
    const snap = await docRef.get();

    if (!snap.exists) {
      throw this.createServiceError('Email confirmation is required before registration', 400);
    }

    const data = snap.data() as {
      verified?: boolean;
      verificationTokenHash?: string;
      tokenExpiresAt?: FirebaseFirestore.Timestamp;
    };

    if (!data?.verified || !data.verificationTokenHash) {
      throw this.createServiceError('Email confirmation is required before registration', 400);
    }

    const tokenExpiresAtMs = data.tokenExpiresAt?.toMillis?.() ?? 0;
    if (!tokenExpiresAtMs || Date.now() > tokenExpiresAtMs) {
      await docRef.delete();
      throw this.createServiceError('Email confirmation expired. Please request a new code.', 410);
    }

    const tokenHash = this.hashToken(String(verificationToken ?? ''));
    if (!this.safeEqual(tokenHash, data.verificationTokenHash)) {
      throw this.createServiceError('Invalid email confirmation token', 400);
    }

    return { docRef };
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
    return registrationCodeTemplates[locale](code);
  }

  private getResetPasswordTemplate(lang: 'ru' | 'lv', resetLink: string): { subject: string; html: string } {
    return passwordResetTemplates[lang](resetLink);
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

  private async getCurrentAuthEmail(user: RequestUser): Promise<string> {
    const authUser = await this.firebaseAdminService.auth.getUser(user.uid);
    const authEmail = typeof authUser.email === 'string' ? this.normalizeEmail(authUser.email) : '';
    if (!authEmail) {
      const tokenEmail = typeof user.email === 'string' ? this.normalizeEmail(user.email) : '';
      if (tokenEmail) return tokenEmail;

      throw this.createServiceError('Authenticated user email was not found', 400);
    }

    return authEmail;
  }

  private buildEmailChangeLink(request: Request, token: string): string {
    void request;
    const origin = (
      this.configService.get<string>('APP_URL')?.trim() ||
      this.configService.get<string>('FRONTEND_URL')?.trim() ||
      'https://domera.app'
    ).replace(/\/+$/, '');
    const url = new URL('/confirm-email', origin);
    url.searchParams.set('token', token);
    return url.toString();
  }

  private getEmailChangeTemplate(link: string): { subject: string; html: string } {
    return {
      subject: 'Domera e-pasta maiņas apstiprināšana',
      html: renderEmailLayout({
        language: 'lv',
        title: 'Apstipriniet e-pasta maiņu',
        badge: 'Drošība',
        children: `
          ${paragraph('Lai mainītu savu Domera konta e-pastu, nospiediet pogu zemāk.')}
          ${button('Apstiprināt e-pastu', link)}
          ${note('Saite ir derīga 1 stundu. Ja neesat pieprasījis e-pasta maiņu, varat droši ignorēt šo ziņojumu.')}
        `,
      }),
    };
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
    role?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    companyName?: string;
    registrationNumber?: string;
    apartmentId?: string;
    acceptedPrivacyPolicyAt?: Date;
    acceptedTermsAt?: Date;
  }) {
    const ref = this.firebaseAdminService.firestore.collection('users').doc(input.uid);
    const snap = await ref.get();
    const current = snap.exists ? (snap.data() as Record<string, unknown>) : {};

    const isPlatformAdmin = this.isConfiguredPlatformAdmin({ uid: input.uid, email: input.email });
    const accountType = isPlatformAdmin
      ? 'PlatformAdmin'
      : (resolveAccountType({ role: current.role, accountType: input.accountType ?? current.accountType }) ??
        this.inferAccountTypeFromEmail(input.email));
    const role = isPlatformAdmin
      ? 'PlatformAdmin'
      : (resolveUserRole({
          role: input.role ?? current.role,
          accountType: input.accountType ?? current.accountType ?? accountType,
        }) ?? accountType);

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
    const acceptedPrivacyPolicyAt =
      input.acceptedPrivacyPolicyAt ||
      (current.acceptedPrivacyPolicyAt instanceof Date
        ? current.acceptedPrivacyPolicyAt
        : ((current.acceptedPrivacyPolicyAt as { toDate?: () => Date } | undefined)?.toDate?.() ?? undefined));
    const acceptedTermsAt =
      input.acceptedTermsAt ||
      (current.acceptedTermsAt instanceof Date
        ? current.acceptedTermsAt
        : ((current.acceptedTermsAt as { toDate?: () => Date } | undefined)?.toDate?.() ?? undefined));

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
        acceptedPrivacyPolicyAt,
        acceptedTermsAt,
        createdAt: current.createdAt ?? new Date(),
        updatedAt: new Date(),
      }).filter(([, value]) => value !== undefined && value !== ''),
    );

    await ref.set(nextData, { merge: true });
    return nextData as Record<string, unknown>;
  }

  private async ensureManagementCompanyDocument(input: {
    uid: string;
    email: string;
    companyEmail?: string;
    phone?: string;
    companyName?: string;
    registrationNumber?: string;
  }) {
    const ref = this.firebaseAdminService.firestore.collection('companies').doc(input.uid);
    const snap = await ref.get();
    const current = snap.exists ? (snap.data() as Record<string, unknown>) : {};
    const companyName =
      (typeof input.companyName === 'string' && input.companyName.trim()) ||
      (typeof current.companyName === 'string' ? current.companyName : undefined) ||
      (typeof current.name === 'string' ? current.name : undefined) ||
      input.email;
    const companyEmail =
      (typeof input.companyEmail === 'string' && input.companyEmail.trim()
        ? this.normalizeEmail(input.companyEmail)
        : undefined) ||
      (typeof current.companyEmail === 'string' && current.companyEmail.trim()
        ? this.normalizeEmail(current.companyEmail)
        : undefined) ||
      (typeof current.email === 'string' && current.email.trim()
        ? this.normalizeEmail(current.email)
        : undefined) ||
      (typeof current.contactEmail === 'string' && current.contactEmail.trim()
        ? this.normalizeEmail(current.contactEmail)
        : undefined) ||
      input.email;
    const companyPhone =
      (typeof input.phone === 'string' && input.phone.trim()) ||
      (typeof current.companyPhone === 'string' ? current.companyPhone : undefined) ||
      (typeof current.phone === 'string' ? current.phone : undefined) ||
      (typeof current.contactPhone === 'string' ? current.contactPhone : undefined);
    const registrationNumber =
      (typeof input.registrationNumber === 'string' && input.registrationNumber.trim()) ||
      (typeof current.registrationNumber === 'string' ? current.registrationNumber : undefined);
    const currentManagers = Array.isArray(current.manager)
      ? current.manager.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    const manager = Array.from(new Set([...currentManagers, input.uid]));
    const currentUserIds = Array.isArray(current.userIds)
      ? current.userIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    const userIds = Array.from(new Set([...currentUserIds, input.uid]));

    const nextData = Object.fromEntries(
      Object.entries({
        ...current,
        manager,
        companyId: input.uid,
        userIds,
        userId: FieldValue.delete(),
        role: FieldValue.delete(),
        accountType: FieldValue.delete(),
        companyName,
        companyEmail,
        companyPhone,
        name: FieldValue.delete(),
        email: FieldValue.delete(),
        phone: FieldValue.delete(),
        contactEmail: FieldValue.delete(),
        contactPhone: FieldValue.delete(),
        registrationNumber,
        firstName: FieldValue.delete(),
        lastName: FieldValue.delete(),
        fullName: FieldValue.delete(),
        contactName: FieldValue.delete(),
        buildings: Array.isArray(current.buildings) ? current.buildings : [],
        createdAt: current.createdAt ?? new Date(),
        updatedAt: new Date(),
      }).filter(([, value]) => value !== undefined && value !== ''),
    );

    await ref.set(nextData, { merge: true });
    await this.ensureCompanyStorageFolders(ref, input.uid);
    return nextData as Record<string, unknown>;
  }

  private getCompanyStorageFolders(companyId: string): string[] {
    const base = `companies/${companyId}`;

    return [
      base,
      `${base}/buildings`,
      `${base}/documents`,
      `${base}/invoices`,
    ];
  }

  private async ensureCompanyStorageFolders(
    ref: FirebaseFirestore.DocumentReference,
    companyId: string,
  ): Promise<void> {
    try {
      await this.firebaseAdminService.createStorageFolders(this.getCompanyStorageFolders(companyId));
      await ref.set(
        {
          storageFoldersStatus: 'ready',
          storageFoldersError: FieldValue.delete(),
          storageFoldersUpdatedAt: new Date(),
        },
        { merge: true },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Failed to create management company storage folders:', message);
      await ref.set(
        {
          storageFoldersStatus: 'pending',
          storageFoldersError: message,
          storageFoldersUpdatedAt: new Date(),
        },
        { merge: true },
      );
    }
  }

  async createSessionCookie(input: SetSessionDto): Promise<{
    cookie: string;
    maxAgeSeconds: number;
    userId: string;
    email?: string;
    role?: string;
    accountType?: string;
    companyId?: string;
    apartmentId?: string;
  }> {
    let decoded: Awaited<ReturnType<typeof this.firebaseAdminService.auth.verifyIdToken>>;
    try {
      decoded = await this.firebaseAdminService.auth.verifyIdToken(input.idToken, true);
    } catch (error) {
      console.error('Failed to verify Firebase ID token during session creation:', error);
      throw this.createServiceError(
        'Failed to verify Firebase session token. Check that FIREBASE_WEB_API_KEY and Firebase Admin project belong to the same Firebase project.',
        500,
      );
    }

    if (input.userId && input.userId !== decoded.uid) {
      throw new Error('userId does not match token subject');
    }

    if (input.email && decoded.email && input.email.toLowerCase() !== decoded.email.toLowerCase()) {
      throw new Error('email does not match token subject');
    }

    const email = decoded.email ? this.normalizeEmail(decoded.email) : undefined;
    let hydratedProfile: Record<string, unknown> | undefined;

    if (email) {
      try {
        hydratedProfile = await this.ensureUserProfileDocument({
          uid: decoded.uid,
          email,
        });

        if (resolveAccountType({ role: hydratedProfile.role, accountType: hydratedProfile.accountType }) === 'ManagementCompany') {
          await this.ensureManagementCompanyDocument({
            uid: decoded.uid,
            email,
          });
        }
      } catch (error) {
        console.error('Failed to hydrate Firebase user profile during session creation:', error);
      }
    }

    let role = resolveUserRole({ role: decoded.role });
    let accountType = resolveAccountType({ role, accountType: decoded.accountType });
    let companyId = typeof decoded.companyId === 'string' ? decoded.companyId : undefined;
    let apartmentId = typeof decoded.apartmentId === 'string' ? decoded.apartmentId : undefined;

    if (hydratedProfile) {
      role = role ?? resolveUserRole({ role: hydratedProfile.role, accountType: hydratedProfile.accountType });
      accountType = accountType ?? resolveAccountType({
        role: hydratedProfile.role,
        accountType: hydratedProfile.accountType,
      });
      companyId = companyId ?? (typeof hydratedProfile.companyId === 'string' ? hydratedProfile.companyId : undefined);
      apartmentId = apartmentId ?? (typeof hydratedProfile.apartmentId === 'string' ? hydratedProfile.apartmentId : undefined);
    }

    if (!role || !accountType || !companyId || !apartmentId) {
      try {
        const userDoc = await this.firebaseAdminService.firestore.collection('users').doc(decoded.uid).get();
        if (userDoc.exists) {
          const userData = userDoc.data() as Record<string, unknown>;
          role = role ?? resolveUserRole({ role: userData.role, accountType: userData.accountType });
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

    if (this.isConfiguredPlatformAdmin({ uid: decoded.uid, email: decoded.email })) {
      role = 'PlatformAdmin';
      accountType = 'PlatformAdmin';
      companyId = undefined;
      apartmentId = undefined;

      await this.firebaseAdminService.firestore.collection('users').doc(decoded.uid).set(
        {
          uid: decoded.uid,
          email: decoded.email,
          role,
          accountType,
          companyId: FieldValue.delete(),
          updatedAt: new Date(),
        },
        { merge: true },
      );
    }

    const standardTtlMinutes = Number(this.configService.get<string>('FIREBASE_SESSION_TTL_MINUTES') ?? '30');
    const rememberMeTtlMinutes = Number(
      this.configService.get<string>('FIREBASE_REMEMBER_ME_SESSION_TTL_MINUTES') ?? String(14 * 24 * 60),
    );
    const ttlMinutes = input.rememberMe ? rememberMeTtlMinutes : standardTtlMinutes;
    const ttlMs = Math.min(Math.max(ttlMinutes, 5), 14 * 24 * 60) * 60 * 1000;
    let sessionCookie: string;
    try {
      sessionCookie = await this.firebaseAdminService.auth.createSessionCookie(input.idToken, {
        expiresIn: ttlMs,
      });
    } catch (error) {
      console.error('Failed to create Firebase session cookie:', error);
      throw this.createServiceError(
        'Failed to create Firebase session cookie. Check Firebase Admin credentials and project configuration.',
        500,
      );
    }

    return {
      cookie: sessionCookie,
      maxAgeSeconds: Math.floor(ttlMs / 1000),
      userId: decoded.uid,
      email,
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

    const rl = await this.rateLimitService.consume(
      this.rateLimitService.buildKey(request, 'auth:login', email || 'anon'),
      8,
      60_000,
    );
    if (!rl.allowed) {
      const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
      const error = new Error('Too many requests');
      (error as Error & { statusCode?: number; retryAfter?: number }).statusCode = 429;
      (error as Error & { statusCode?: number; retryAfter?: number }).retryAfter = retryAfter;
      throw error;
    }

    const authResult = await this.callIdentityToolkit<{
      idToken: string;
      localId: string;
      email?: string;
    }>('signInWithPassword', {
      email,
      password: input.password,
      returnSecureToken: true,
    });

    const profile = await this.ensureUserProfileDocument({
      uid: authResult.localId,
      email: authResult.email ?? email,
    });

    if (resolveAccountType({ role: profile.role, accountType: profile.accountType }) === 'ManagementCompany') {
      await this.ensureManagementCompanyDocument({
        uid: authResult.localId,
        email: authResult.email ?? email,
      });
    }

    const session = await this.createSessionCookie({
      idToken: authResult.idToken,
      userId: authResult.localId,
      email: authResult.email ?? email,
      rememberMe: input.rememberMe,
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
      idToken: authResult.idToken,
      session,
    };
  }

  async registerWithEmailPassword(request: Request, input: RegisterDto) {
    const email = this.normalizeEmail(input.email ?? '');
    if (!input.acceptedPrivacyPolicy || !input.acceptedTerms) {
      throw this.createServiceError('You must accept the privacy policy and terms of use', 400);
    }
    const accountType = resolveAccountType({ accountType: input.accountType }) ?? 'Resident';
    if (!isPublicRegistrationRole(accountType)) {
      throw this.createServiceError('This account type cannot be created through public registration', 403);
    }
    const role = resolveUserRole({ role: input.accountType, accountType }) ?? accountType;
    const fullName = [input.firstName?.trim(), input.lastName?.trim()]
      .filter((value): value is string => Boolean(value))
      .join(' ')
      .trim();
    const legalAcceptedAt = new Date();
    const verification = await this.validateRegistrationVerification(email, input.verificationToken);

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
      role,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      companyName: input.companyName,
      registrationNumber: input.registrationNumber,
      acceptedPrivacyPolicyAt: legalAcceptedAt,
      acceptedTermsAt: legalAcceptedAt,
    });

    if (accountType === 'ManagementCompany') {
      await this.ensureManagementCompanyDocument({
        uid,
        email,
        companyEmail: input.companyEmail,
        phone: input.phone,
        companyName: input.companyName,
        registrationNumber: input.registrationNumber,
      });
    }

    await verification.docRef.delete();

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
      idToken: authResult.idToken,
      session,
    };
  }

  async changeEmail(request: Request, user: RequestUser, input: ChangeEmailDto) {
    if (!user?.uid) {
      throw this.createServiceError('Authentication required', 401);
    }

    const currentEmail = await this.getCurrentAuthEmail(user);
    const nextEmail = this.normalizeEmail(input.email ?? '');

    if (!nextEmail) {
      throw this.createServiceError('Email is required', 400);
    }

    if (nextEmail === currentEmail) {
      return { success: true, userId: user.uid, email: currentEmail, verificationRequired: false };
    }

    try {
      const existing = await this.firebaseAdminService.auth.getUserByEmail(nextEmail);
      if (existing.uid !== user.uid) {
        throw this.createServiceError('This email is already registered', 409);
      }
    } catch (error) {
      if ((error as { statusCode?: number } | undefined)?.statusCode === 409) {
        throw error;
      }

      const code = (error as { code?: string } | undefined)?.code;
      if (code && code !== 'auth/user-not-found') {
        throw error;
      }
    }

    const token = randomUUID();
    const tokenHash = this.hashToken(token);
    const now = Date.now();

    await this.emailChangeRequestsCollection(user.uid).doc(tokenHash).set({
      uid: user.uid,
      currentEmail,
      nextEmail,
      tokenHash,
      createdAt: new Date(now),
      expiresAt: new Date(now + EMAIL_CHANGE_TTL_MS),
      status: 'pending',
    });

    const link = this.buildEmailChangeLink(request, token);
    const resendConfig = this.getResendConfig();
    const resend = new Resend(resendConfig.apiKey);
    const template = this.getEmailChangeTemplate(link);
    const { error: resendError } = await resend.emails.send({
      from: resendConfig.from,
      to: nextEmail,
      subject: template.subject,
      html: template.html,
    });

    if (resendError) {
      throw this.createServiceError(`Failed to send verification email: ${resendError.message}`, 500);
    }

    void this.auditLogService.write({
      request,
      action: 'auth.email_change_request',
      status: 'success',
      targetEmail: nextEmail,
      metadata: { previousEmail: currentEmail, targetUserId: user.uid },
    });

    return {
      success: true,
      userId: user.uid,
      email: currentEmail,
      pendingEmail: nextEmail,
      verificationRequired: true,
    };
  }

  async confirmEmailChange(request: Request, token: string) {
    const rawToken = String(token ?? '').trim();
    if (!rawToken) {
      throw this.createServiceError('Verification token is required', 400);
    }

    const tokenHash = this.hashToken(rawToken);
    const snap = await this.firebaseAdminService.firestore
      .collectionGroup(EMAIL_CHANGE_COLLECTION)
      .where('tokenHash', '==', tokenHash)
      .limit(1)
      .get();
    const legacySnap = snap.empty
      ? await this.firebaseAdminService.firestore.collection(EMAIL_CHANGE_COLLECTION).doc(tokenHash).get()
      : null;
    const requestDoc = snap.docs[0] ?? (legacySnap?.exists ? legacySnap : undefined);

    if (!requestDoc?.exists) {
      throw this.createServiceError('Verification link is invalid or expired', 404);
    }

    const ref = requestDoc.ref;
    const data = requestDoc.data() as {
      uid?: string;
      currentEmail?: string;
      nextEmail?: string;
      expiresAt?: FirebaseFirestore.Timestamp;
      status?: string;
    };

    const uid = typeof data.uid === 'string' ? data.uid : '';
    const nextEmail = typeof data.nextEmail === 'string' ? this.normalizeEmail(data.nextEmail) : '';
    const currentEmail = typeof data.currentEmail === 'string' ? this.normalizeEmail(data.currentEmail) : '';
    const expiresAtMs = data.expiresAt?.toMillis?.() ?? 0;

    if (!uid || !nextEmail || data.status !== 'pending' || !expiresAtMs || Date.now() > expiresAtMs) {
      await ref.set({ status: 'expired', updatedAt: new Date() }, { merge: true }).catch(() => undefined);
      throw this.createServiceError('Verification link is invalid or expired', 410);
    }

    try {
      const existing = await this.firebaseAdminService.auth.getUserByEmail(nextEmail);
      if (existing.uid !== uid) {
        throw this.createServiceError('This email is already registered', 409);
      }
    } catch (error) {
      if ((error as { statusCode?: number } | undefined)?.statusCode === 409) {
        throw error;
      }

      const code = (error as { code?: string } | undefined)?.code;
      if (code && code !== 'auth/user-not-found') {
        throw error;
      }
    }

    const userRef = this.firebaseAdminService.firestore.collection('users').doc(uid);
    const userSnap = await userRef.get();
    const currentUserData = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : {};

    await this.firebaseAdminService.auth.updateUser(uid, { email: nextEmail });
    await userRef.set(
      {
        uid,
        email: nextEmail,
        updatedAt: new Date(),
      },
      { merge: true },
    );
    await this.usersService.syncLinkedApartmentProfiles(uid, currentUserData, {
      ...currentUserData,
      uid,
      email: nextEmail,
    });
    await ref.set({ status: 'confirmed', confirmedAt: new Date(), updatedAt: new Date() }, { merge: true });

    void this.auditLogService.write({
      request,
      action: 'auth.email_change_confirm',
      status: 'success',
      targetEmail: nextEmail,
      metadata: { previousEmail: currentEmail, targetUserId: uid },
    });

    return { success: true, userId: uid, email: nextEmail };
  }

  async changePassword(request: Request, user: RequestUser, input: ChangePasswordDto) {
    if (!user?.uid) {
      throw this.createServiceError('Authentication required', 401);
    }

    const email = await this.getCurrentAuthEmail(user);

    await this.callIdentityToolkit('signInWithPassword', {
      email,
      password: input.currentPassword,
      returnSecureToken: true,
    });

    await this.firebaseAdminService.auth.updateUser(user.uid, { password: input.newPassword });

    await this.firebaseAdminService.firestore.collection('users').doc(user.uid).set(
      {
        uid: user.uid,
        updatedAt: new Date(),
      },
      { merge: true },
    );

    const authResult = await this.callIdentityToolkit<{ idToken: string; localId: string; email?: string }>(
      'signInWithPassword',
      {
        email,
        password: input.newPassword,
        returnSecureToken: true,
      },
    );

    const session = await this.createSessionCookie({
      idToken: authResult.idToken,
      userId: user.uid,
      email,
    });

    void this.auditLogService.write({
      request,
      action: 'auth.password_change',
      status: 'success',
      targetEmail: email,
      metadata: { targetUserId: user.uid },
    });

    return { success: true, userId: user.uid, email, session };
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

    const origin = (
      this.configService.get<string>('APP_URL')?.trim() ||
      this.configService.get<string>('FRONTEND_URL')?.trim() ||
      'https://domera.app'
    ).replace(/\/+$/, '');

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
