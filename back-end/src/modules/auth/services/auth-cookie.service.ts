import { Injectable } from '@nestjs/common';
import { Response } from 'express';
import { LEGACY_AUTH_COOKIE_NAMES, SESSION_COOKIE_NAME } from '../constants/auth.constants';
import { AuthSessionCookie } from '../types/auth-session.types';

@Injectable()
export class AuthCookieService {
  applySessionCookies(response: Response, session: AuthSessionCookie) {
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' as const : 'lax' as const,
      maxAge: session.maxAgeSeconds * 1000,
      path: '/',
    };

    response.cookie(SESSION_COOKIE_NAME, session.cookie, cookieOptions);
    this.clearLegacyAuthCookies(response);
  }

  clearAuthCookies(response: Response) {
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' as const : 'lax' as const,
      path: '/',
    };

    response.clearCookie(SESSION_COOKIE_NAME, cookieOptions);
    response.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    this.clearLegacyAuthCookies(response);
  }

  private clearLegacyAuthCookies(response: Response) {
    for (const name of LEGACY_AUTH_COOKIE_NAMES) {
      response.clearCookie(name, { path: '/' });
    }
  }
}
