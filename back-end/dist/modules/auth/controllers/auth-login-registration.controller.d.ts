import { Request, Response } from 'express';
import { AuthService } from '../auth.service';
import { LoginDto } from '../dto/login.dto';
import { RegisterDto } from '../dto/register.dto';
import { RegisterEmailCodeRequestDto } from '../dto/register-email-code-request.dto';
import { RegisterEmailCodeVerifyDto } from '../dto/register-email-code-verify.dto';
import { AuthCookieService } from '../services/auth-cookie.service';
import { AuthExceptionMapperService } from '../services/auth-exception-mapper.service';
export declare class AuthLoginRegistrationController {
    private readonly authService;
    private readonly authCookieService;
    private readonly exceptionMapper;
    constructor(authService: AuthService, authCookieService: AuthCookieService, exceptionMapper: AuthExceptionMapperService);
    login(request: Request, dto: LoginDto, response: Response): Promise<{
        success: boolean;
        userId: string;
        email: string;
        role: string | undefined;
        accountType: string | undefined;
        companyId: string | undefined;
        apartmentId: string | undefined;
    }>;
    register(request: Request, dto: RegisterDto, response: Response): Promise<{
        success: boolean;
        userId: string;
        email: string;
        role: string | undefined;
        accountType: string | undefined;
        companyId: string | undefined;
        apartmentId: string | undefined;
    }>;
    requestRegisterEmailCode(request: Request, dto: RegisterEmailCodeRequestDto, response: Response): Promise<{
        success: boolean;
        expiresInSeconds: number;
    }>;
    verifyRegisterEmailCode(request: Request, dto: RegisterEmailCodeVerifyDto, response: Response): Promise<{
        success: boolean;
        verificationToken: string;
        expiresInSeconds: number;
    }>;
}
