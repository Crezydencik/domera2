import { Response } from 'express';
import { AuthSessionCookie } from '../types/auth-session.types';
export declare class AuthCookieService {
    applySessionCookies(response: Response, session: AuthSessionCookie): void;
    clearAuthCookies(response: Response): void;
    private clearLegacyAuthCookies;
}
