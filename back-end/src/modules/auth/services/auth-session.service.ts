import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FieldValue } from 'firebase-admin/firestore';
import {
  resolveAccountType,
  resolveUserRole,
} from '../../../common/auth/role.constants';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { SetSessionDto } from '../dto/set-session.dto';
import { AuthSessionResult } from '../types/auth-session.types';
import { AuthProfileProvisioningService } from './auth-profile-provisioning.service';

@Injectable()
export class AuthSessionService {
  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly configService: ConfigService,
    private readonly profileProvisioningService: AuthProfileProvisioningService,
  ) {}

  async createSessionCookieFromTrustedLogin(input: {
    idToken: string;
    userId: string;
    email?: string;
    rememberMe?: boolean;
    profile?: Record<string, unknown>;
  }): Promise<AuthSessionResult> {
    const email = input.email ? this.normalizeEmail(input.email) : undefined;
    const profile = input.profile;
    let role = resolveUserRole({ role: profile?.role, accountType: profile?.accountType });
    let accountType = resolveAccountType({ role, accountType: profile?.accountType });
    let companyId = typeof profile?.companyId === 'string' ? profile.companyId : undefined;
    let apartmentId = typeof profile?.apartmentId === 'string' ? profile.apartmentId : undefined;

    if (this.profileProvisioningService.isConfiguredPlatformAdmin({ uid: input.userId, email })) {
      role = 'PlatformAdmin';
      accountType = 'PlatformAdmin';
      companyId = undefined;
      apartmentId = undefined;

      void this.firebaseAdminService.firestore.collection('users').doc(input.userId).set(
        {
          uid: input.userId,
          email,
          role,
          accountType,
          companyId: FieldValue.delete(),
          updatedAt: new Date(),
        },
        { merge: true },
      ).catch((error) => {
        console.error('Failed to update platform admin profile during login:', error);
      });
    }

    const ttlMs = this.getSessionTtlMs(input.rememberMe);
    const sessionCookie = await this.createFirebaseSessionCookie(input.idToken, ttlMs);

    return {
      cookie: sessionCookie,
      maxAgeSeconds: Math.floor(ttlMs / 1000),
      userId: input.userId,
      email,
      role,
      accountType,
      companyId,
      apartmentId,
    };
  }

  async createSessionCookie(input: SetSessionDto): Promise<AuthSessionResult> {
    let decoded: Awaited<ReturnType<typeof this.firebaseAdminService.auth.verifyIdToken>>;
    try {
      decoded = await this.firebaseAdminService.auth.verifyIdToken(input.idToken, true);
    } catch (error) {
      const code = (error as { code?: string } | undefined)?.code;
      if (
        code === 'auth/id-token-expired' ||
        code === 'auth/id-token-revoked' ||
        code === 'auth/argument-error'
      ) {
        throw this.createServiceError('Invalid or expired authentication token', 401);
      }

      console.error('Failed to verify Firebase ID token during session creation:', error);
      throw this.createServiceError('Authentication service is unavailable', 500);
    }

    if (input.userId && input.userId !== decoded.uid) {
      throw this.createServiceError('Invalid authentication token subject', 401);
    }

    if (input.email && decoded.email && input.email.toLowerCase() !== decoded.email.toLowerCase()) {
      throw this.createServiceError('Invalid authentication token subject', 401);
    }

    const email = decoded.email ? this.normalizeEmail(decoded.email) : undefined;
    let hydratedProfile: Record<string, unknown> | undefined;

    if (email) {
      try {
        hydratedProfile = await this.profileProvisioningService.ensureUserProfileDocument({
          uid: decoded.uid,
          email,
        });

        if (resolveAccountType({ role: hydratedProfile.role, accountType: hydratedProfile.accountType }) === 'ManagementCompany') {
          await this.profileProvisioningService.ensureManagementCompanyDocument({
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

    if (!hydratedProfile && (!role || !accountType || !companyId || !apartmentId)) {
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

    if (this.profileProvisioningService.isConfiguredPlatformAdmin({ uid: decoded.uid, email: decoded.email })) {
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

    const ttlMs = this.getSessionTtlMs(input.rememberMe);
    const sessionCookie = await this.createFirebaseSessionCookie(input.idToken, ttlMs);

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

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private getSessionTtlMs(rememberMe?: boolean) {
    const standardTtlMinutes = Number(this.configService.get<string>('FIREBASE_SESSION_TTL_MINUTES') ?? '30');
    const rememberMeTtlMinutes = Number(
      this.configService.get<string>('FIREBASE_REMEMBER_ME_SESSION_TTL_MINUTES') ?? String(14 * 24 * 60),
    );
    const ttlMinutes = rememberMe ? rememberMeTtlMinutes : standardTtlMinutes;
    return Math.min(Math.max(ttlMinutes, 5), 14 * 24 * 60) * 60 * 1000;
  }

  private async createFirebaseSessionCookie(idToken: string, ttlMs: number) {
    try {
      return await this.firebaseAdminService.auth.createSessionCookie(idToken, {
        expiresIn: ttlMs,
      });
    } catch (error) {
      console.error('Failed to create Firebase session cookie:', error);
      throw this.createServiceError(
        'Failed to create Firebase session cookie. Check Firebase Admin credentials and project configuration.',
        500,
      );
    }
  }

  private createServiceError(message: string, statusCode: number): Error & { statusCode?: number } {
    const error = new Error(message) as Error & { statusCode?: number };
    error.statusCode = statusCode;
    return error;
  }
}
