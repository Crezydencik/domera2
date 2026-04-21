import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { parse as parseCookie } from 'cookie';
import { FirebaseAdminService } from '../infrastructure/firebase/firebase-admin.service';
import { resolveAccountType, normalizeUserRole } from './role.constants';
import { RequestUser } from './request-user.type';

const SESSION_COOKIE_NAME = '__session';

const toOptionalString = (value: unknown): string | undefined => {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
};

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
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
      const decoded = token.source === 'session'
        ? await this.firebaseAdminService.auth.verifySessionCookie(token.value, true)
        : await this.firebaseAdminService.auth.verifyIdToken(token.value, true);

      let role = normalizeUserRole(decoded.role);
      let accountType = resolveAccountType({ role, accountType: decoded.accountType });
      let companyId = toOptionalString(decoded.companyId);
      let apartmentId = toOptionalString(decoded.apartmentId);

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
            companyId = companyId ?? toOptionalString(userData.companyId);
            apartmentId = apartmentId ?? toOptionalString(userData.apartmentId);
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
    | { source: 'session' | 'bearer'; value: string }
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
}