import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
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
import {
  isPublicRegistrationRole,
  resolveAccountType,
  resolveUserRole,
} from '../../common/auth/role.constants';
import { RequestUser } from '../../common/auth/request-user.type';
import { UsersService } from '../users/users.service';
import { AuthEmailService } from './services/auth-email.service';
import { AuthProfileProvisioningService } from './services/auth-profile-provisioning.service';
import { AuthSessionService } from './services/auth-session.service';
import { FirebaseIdentityToolkitService } from './services/firebase-identity-toolkit.service';
import { RegistrationCodeService } from './services/registration-code.service';
import { AuthSessionResult } from './types/auth-session.types';

const EMAIL_CHANGE_TTL_MS = 30 * 60 * 1000;
const EMAIL_CHANGE_COLLECTION = 'email_change_requests';

@Injectable()
export class AuthService {
  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly configService: ConfigService,
    private readonly rateLimitService: RateLimitService,
    private readonly auditLogService: AuditLogService,
    private readonly usersService: UsersService,
    private readonly registrationCodeService: RegistrationCodeService,
    private readonly authEmailService: AuthEmailService,
    private readonly profileProvisioningService: AuthProfileProvisioningService,
    private readonly authSessionService: AuthSessionService,
    private readonly identityToolkitService: FirebaseIdentityToolkitService,
  ) {}

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private generateSecureToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private emailChangeRequestsCollection(uid: string) {
    return this.firebaseAdminService.firestore
      .collection('users')
      .doc(uid)
      .collection(EMAIL_CHANGE_COLLECTION);
  }

  private async revokePendingEmailChanges(uid: string): Promise<void> {
    const snapshot = await this.emailChangeRequestsCollection(uid)
      .where('status', '==', 'pending')
      .get();

    if (snapshot.empty) return;

    const batch = this.firebaseAdminService.firestore.batch();
    for (const document of snapshot.docs) {
      batch.update(document.ref, {
        status: 'revoked',
        revokedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
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

  async createSessionCookie(input: SetSessionDto): Promise<AuthSessionResult> {
    return this.authSessionService.createSessionCookie(input);
  }

  async requestRegisterEmailCode(request: Request, input: RegisterEmailCodeRequestDto) {
    return this.registrationCodeService.request(request, input);
  }

  async verifyRegisterEmailCode(request: Request, input: RegisterEmailCodeVerifyDto) {
    return this.registrationCodeService.verify(request, input);
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

    const authResult = await this.identityToolkitService.call<{
      idToken: string;
      localId: string;
      email?: string;
    }>('signInWithPassword', {
      email,
      password: input.password,
      returnSecureToken: true,
    });

    const profile = await this.profileProvisioningService.ensureUserProfileDocument({
      uid: authResult.localId,
      email: authResult.email ?? email,
    });

    if (resolveAccountType({ role: profile.role, accountType: profile.accountType }) === 'ManagementCompany') {
      void this.profileProvisioningService.ensureManagementCompanyDocument({
        uid: authResult.localId,
        email: authResult.email ?? email,
      }).catch((error) => {
        console.error('Failed to hydrate management company during login:', error);
      });
    }

    const session = await this.authSessionService.createSessionCookieFromTrustedLogin({
      idToken: authResult.idToken,
      userId: authResult.localId,
      email: authResult.email ?? email,
      rememberMe: input.rememberMe,
      profile,
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
    const verification = await this.registrationCodeService.consumeRegistrationVerification(
      email,
      input.verificationToken,
    );

    let uid: string;
    let createdUid: string | undefined;

    try {
      const created = await this.firebaseAdminService.auth.createUser({
        email,
        password: input.password,
        displayName: fullName || undefined,
      });
      uid = created.uid;
      createdUid = created.uid;
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

    try {
      await this.profileProvisioningService.ensureUserProfileDocument({
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
        await this.profileProvisioningService.ensureManagementCompanyDocument({
          uid,
          email,
          companyEmail: input.companyEmail,
          phone: input.phone,
          companyName: input.companyName,
          registrationNumber: input.registrationNumber,
        });
      }
    } catch (error) {
      if (createdUid) {
        await this.firebaseAdminService.auth.deleteUser(createdUid).catch((rollbackError) => {
          console.error(`Failed to rollback auth user ${createdUid}:`, rollbackError);
        });
      }

      throw error;
    }

    await verification.docRef.delete();

    const authResult = await this.identityToolkitService.call<{
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

    const token = this.generateSecureToken();
    const tokenHash = this.hashToken(token);
    const now = Date.now();

    await this.revokePendingEmailChanges(user.uid);

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
    const { errorMessage } = await this.authEmailService.sendEmailChangeVerification(nextEmail, link);

    if (errorMessage) {
      throw this.createServiceError(`Failed to send verification email: ${errorMessage}`, 500);
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
    await this.firebaseAdminService.auth.revokeRefreshTokens(uid);
    await userRef.set(
      {
        uid,
        email: nextEmail,
        updatedAt: new Date(),
      },
      { merge: true },
    );
    if (resolveAccountType({ role: currentUserData.role, accountType: currentUserData.accountType }) === 'ManagementCompany') {
      await this.firebaseAdminService.firestore.collection('companies').doc(uid).set(
        {
          companyEmail: nextEmail,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
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

    await this.identityToolkitService.call('signInWithPassword', {
      email,
      password: input.currentPassword,
      returnSecureToken: true,
    });

    await this.firebaseAdminService.auth.updateUser(user.uid, { password: input.newPassword });
    await this.firebaseAdminService.auth.revokeRefreshTokens(user.uid);

    await this.firebaseAdminService.firestore.collection('users').doc(user.uid).set(
      {
        uid: user.uid,
        updatedAt: new Date(),
      },
      { merge: true },
    );

    const authResult = await this.identityToolkitService.call<{ idToken: string; localId: string; email?: string }>(
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

 }
