import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { parse as parseCookie } from 'cookie';
import { createHash } from 'node:crypto';
import { DecodedIdToken } from 'firebase-admin/auth';
import { FirebaseAdminService } from '../infrastructure/firebase/firebase-admin.service';
import { resolveAccountType, resolveUserRole } from './role.constants';
import { RequestUser } from './request-user.type';

const SESSION_COOKIE_NAME = '__session';
const CHECK_REVOKED_TOKENS = process.env.FIREBASE_CHECK_REVOKED === 'true';
const AUTH_CACHE_TTL_MS = Math.max(
  0,
  Number(process.env.FIREBASE_AUTH_CACHE_TTL_MS ?? (CHECK_REVOKED_TOKENS ? 0 : 60000)),
);
const USER_PROFILE_CACHE_TTL_MS = Math.max(
  0,
  Number(process.env.FIREBASE_USER_PROFILE_CACHE_TTL_MS ?? 60000),
);
const AUTH_CACHE_MAX_ENTRIES = Math.max(50, Number(process.env.FIREBASE_AUTH_CACHE_MAX_ENTRIES ?? 1000));
const USER_PROFILE_CACHE_MAX_ENTRIES = Math.max(50, Number(process.env.FIREBASE_USER_PROFILE_CACHE_MAX_ENTRIES ?? 1000));

const toOptionalString = (value: unknown): string | undefined => {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
};

type TokenSource = 'session' | 'bearer';
type AuthToken = { source: TokenSource; value: string };
type CacheEntry<T> = {
  expiresAt: number;
  promise: Promise<T>;
};
type UserProfileHydration = {
  role?: RequestUser['role'];
  accountType?: RequestUser['accountType'];
  companyId?: string;
  apartmentId?: string;
};

function trimExpiredEntries<T>(cache: Map<string, CacheEntry<T>>, now: number) {
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) {
      cache.delete(key);
    }
  }
}

function enforceMaxEntries<T>(cache: Map<string, CacheEntry<T>>, maxEntries: number) {
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value as string | undefined;
    if (!oldestKey) return;
    cache.delete(oldestKey);
  }
}

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  private static readonly authCache = new Map<string, CacheEntry<DecodedIdToken>>();
  private static readonly userProfileCache = new Map<string, CacheEntry<UserProfileHydration | null>>();

  constructor(private readonly firebaseAdminService: FirebaseAdminService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{
        headers: Record<string, string | undefined>;
        user?: RequestUser;
      }>();

    const token = this.extractToken(request.headers);
    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    try {
      const decoded = await this.verifyToken(token);

      let role = resolveUserRole({ role: decoded.role });
      let accountType = resolveAccountType({ role, accountType: decoded.accountType });
      let companyId = toOptionalString(decoded.companyId);
      let apartmentId = toOptionalString(decoded.apartmentId);

      if (!role || !accountType || !companyId || !apartmentId) {
        try {
          const profile = await this.getUserProfileHydration(decoded.uid);
          if (profile) {
            role = role ?? profile.role;
            accountType = accountType ?? profile.accountType;
            companyId = companyId ?? profile.companyId;
            apartmentId = apartmentId ?? profile.apartmentId;
          }
        } catch {
          // ignore profile hydration errors and keep verified token values
        }
      }

      request.user = {
        uid: decoded.uid,
        email: decoded.email,
        role,
        accountType,
        companyId,
        apartmentId,
      };

      return true;
    } catch {
      throw new UnauthorizedException('Invalid authentication token');
    }
  }

  private extractToken(headers: Record<string, string | undefined>):
    | AuthToken
    | null {
    const authHeader = headers.authorization;
    if (authHeader) {
      const [scheme, token] = authHeader.split(' ');
      if (scheme?.toLowerCase() === 'bearer' && token?.trim()) {
        return { source: 'bearer', value: token.trim() };
      }
    }

    const cookieHeader = headers.cookie;
    if (cookieHeader) {
      const cookies = parseCookie(cookieHeader);
      const session = cookies[SESSION_COOKIE_NAME];
      if (session?.trim()) {
        return { source: 'session', value: session.trim() };
      }
    }

    return null;
  }

  private async verifyToken(token: AuthToken): Promise<DecodedIdToken> {
    if (AUTH_CACHE_TTL_MS <= 0) {
      return this.verifyTokenUncached(token);
    }

    const now = Date.now();
    const key = `${token.source}:${createHash('sha256').update(token.value).digest('base64url')}`;
    const cached = FirebaseAuthGuard.authCache.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.promise;
    }

    trimExpiredEntries(FirebaseAuthGuard.authCache, now);

    const promise = this.verifyTokenUncached(token);
    const entry: CacheEntry<DecodedIdToken> = {
      expiresAt: now + AUTH_CACHE_TTL_MS,
      promise: promise.then((decoded) => {
        const tokenExpiresAt = typeof decoded.exp === 'number' ? decoded.exp * 1000 : entry.expiresAt;
        entry.expiresAt = Math.min(entry.expiresAt, tokenExpiresAt);
        return decoded;
      }),
    };

    FirebaseAuthGuard.authCache.set(key, entry);
    enforceMaxEntries(FirebaseAuthGuard.authCache, AUTH_CACHE_MAX_ENTRIES);

    try {
      return await entry.promise;
    } catch (error) {
      FirebaseAuthGuard.authCache.delete(key);
      throw error;
    }
  }

  private verifyTokenUncached(token: AuthToken): Promise<DecodedIdToken> {
    return token.source === 'session'
      ? this.firebaseAdminService.auth.verifySessionCookie(token.value, CHECK_REVOKED_TOKENS)
      : this.firebaseAdminService.auth.verifyIdToken(token.value, CHECK_REVOKED_TOKENS);
  }

  private async getUserProfileHydration(uid: string): Promise<UserProfileHydration | null> {
    if (USER_PROFILE_CACHE_TTL_MS <= 0) {
      return this.getUserProfileHydrationUncached(uid);
    }

    const now = Date.now();
    const cached = FirebaseAuthGuard.userProfileCache.get(uid);
    if (cached && cached.expiresAt > now) {
      return cached.promise;
    }

    trimExpiredEntries(FirebaseAuthGuard.userProfileCache, now);

    const entry: CacheEntry<UserProfileHydration | null> = {
      expiresAt: now + USER_PROFILE_CACHE_TTL_MS,
      promise: this.getUserProfileHydrationUncached(uid),
    };

    FirebaseAuthGuard.userProfileCache.set(uid, entry);
    enforceMaxEntries(FirebaseAuthGuard.userProfileCache, USER_PROFILE_CACHE_MAX_ENTRIES);

    try {
      return await entry.promise;
    } catch (error) {
      FirebaseAuthGuard.userProfileCache.delete(uid);
      throw error;
    }
  }

  private async getUserProfileHydrationUncached(uid: string): Promise<UserProfileHydration | null> {
    const userDoc = await this.firebaseAdminService.firestore.collection('users').doc(uid).get();
    if (!userDoc.exists) return null;

    const userData = userDoc.data() as Record<string, unknown>;
    const role = resolveUserRole({ role: userData.role, accountType: userData.accountType });

    return {
      role,
      accountType: resolveAccountType({
        role: userData.role,
        accountType: userData.accountType,
      }),
      companyId: toOptionalString(userData.companyId),
      apartmentId: toOptionalString(userData.apartmentId),
    };
  }
}

@Injectable()
export class OptionalFirebaseAuthGuard extends FirebaseAuthGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      return await super.canActivate(context);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        return true;
      }

      throw error;
    }
  }
}
