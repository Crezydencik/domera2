import { Response } from 'express';
import { AuthService } from '../auth.service';
import { SetSessionDto } from '../dto/set-session.dto';
import { AuthCookieService } from '../services/auth-cookie.service';
export declare class AuthSessionController {
    private readonly authService;
    private readonly authCookieService;
    constructor(authService: AuthService, authCookieService: AuthCookieService);
    setCookies(dto: SetSessionDto, response: Response): Promise<{
        success: boolean;
        userId: string;
        email: string | undefined;
        role: string | undefined;
        accountType: string | undefined;
        companyId: string | undefined;
        apartmentId: string | undefined;
    }>;
    createSession(dto: SetSessionDto, response: Response): Promise<{
        success: boolean;
        userId: string;
        email: string | undefined;
        role: string | undefined;
        accountType: string | undefined;
        companyId: string | undefined;
        apartmentId: string | undefined;
    }>;
    clearCookies(response: Response): {
        success: boolean;
    };
    clearSession(response: Response): {
        success: boolean;
    };
}
