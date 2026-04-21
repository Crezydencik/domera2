import { Request, Response } from 'express';
import { RegisterEmailCodeRequestDto } from './dto/register-email-code-request.dto';
import { RegisterEmailCodeVerifyDto } from './dto/register-email-code-verify.dto';
import { SendPasswordResetDto } from './dto/send-password-reset.dto';
import { SetSessionDto } from './dto/set-session.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ConfirmPasswordResetDto } from './dto/confirm-password-reset.dto';
import { PreviewPasswordResetDto } from './dto/preview-password-reset.dto';
import { AuthService } from './auth.service';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    private applySessionCookies;
    private mapServiceError;
    getAccountCatalog(): {
        accountTypes: readonly ["ManagementCompany", "Resident", "Landlord"];
        roles: {
            role: import("../../common/auth/role.constants").UserRole;
            accountType: import("../../common/auth/role.constants").AccountType;
            label: string;
            isAssignableOnRegistration: boolean;
        }[];
    };
    setCookies(dto: SetSessionDto, response: Response): Promise<{
        success: boolean;
        role: string | undefined;
        accountType: string | undefined;
        companyId: string | undefined;
        apartmentId: string | undefined;
    }>;
    createSession(dto: SetSessionDto, response: Response): Promise<{
        success: boolean;
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
        verificationToken: `${string}-${string}-${string}-${string}-${string}`;
        expiresInSeconds: number;
    }>;
    sendPasswordReset(request: Request, dto: SendPasswordResetDto, response: Response): Promise<{
        success: boolean;
        message: string;
    }>;
    previewPasswordReset(request: Request, dto: PreviewPasswordResetDto): Promise<{
        email: string;
    }>;
    confirmPasswordReset(request: Request, dto: ConfirmPasswordResetDto): Promise<{
        success: boolean;
    }>;
}
