import { Request, Response } from 'express';
import { AuthService } from '../auth.service';
import { AuthCookieService } from '../services/auth-cookie.service';
import { AuthDocsLoginPageService } from '../services/auth-docs-login-page.service';
export declare class AuthDocsController {
    private readonly authService;
    private readonly authCookieService;
    private readonly docsLoginPageService;
    constructor(authService: AuthService, authCookieService: AuthCookieService, docsLoginPageService: AuthDocsLoginPageService);
    docsLoginForm(request: Request, response: Response): void;
    docsLogin(request: Request, body: {
        email?: string;
        password?: string;
        next?: string;
    }, response: Response): Promise<void>;
}
