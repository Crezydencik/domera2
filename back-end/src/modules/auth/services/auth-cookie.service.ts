import { Injectable } from '@nestjs/common';
import { Response } from 'express';
import { LEGACY_AUTH_COOKIE_NAMES, SESSION_COOKIE_NAME } from '../constants/auth.constants';
import { AuthSessionCookie } from '../types/auth-session.types';

@Injectable()
export class AuthCookieService {
  applySessionCookies(response: Response, session: AuthSessionCookie) {
    const cookieOptions = this.getCookieOptions(session.maxAgeSeconds * 1000);

    response.cookie(SESSION_COOKIE_NAME, session.cookie, cookieOptions);
    this.clearLegacyAuthCookies(response);
  }

  clearAuthCookies(response: Response) {
    const cookieOptions = this.getCookieOptions();

    response.clearCookie(SESSION_COOKIE_NAME, cookieOptions);
    response.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    this.clearLegacyAuthCookies(response);
  }

  private clearLegacyAuthCookies(response: Response) {
    for (const name of LEGACY_AUTH_COOKIE_NAMES) {
      response.clearCookie(name, { path: '/' });
    }
  }

  private getCookieOptions(maxAge?: number) {
    const isProduction = process.env.NODE_ENV === 'production';
    const domain = process.env.SESSION_COOKIE_DOMAIN?.trim();

    return {
      httpOnly: true,
      secure: isProduction,
      // A configured parent domain (for example .domera.lv) makes the
      // Vercel frontend and Cloud Run API same-site. Without it, preserve
      // the cross-site behaviour required by the default run.app URL.
      sameSite: isProduction ? (domain ? 'lax' as const : 'none' as const) : 'lax' as const,
      ...(domain ? { domain } : {}),
      ...(maxAge === undefined ? {} : { maxAge }),
      path: '/',
    };
  }
}
