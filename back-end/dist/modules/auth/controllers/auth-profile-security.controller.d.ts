import { Request, Response } from 'express';
import { RequestUser } from '../../../common/auth/request-user.type';
import { AuthService } from '../auth.service';
import { ChangeEmailDto } from '../dto/change-email.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { ConfirmEmailChangeDto } from '../dto/confirm-email-change.dto';
import { AuthCookieService } from '../services/auth-cookie.service';
import { AuthExceptionMapperService } from '../services/auth-exception-mapper.service';
export declare class AuthProfileSecurityController {
    private readonly authService;
    private readonly authCookieService;
    private readonly exceptionMapper;
    constructor(authService: AuthService, authCookieService: AuthCookieService, exceptionMapper: AuthExceptionMapperService);
    changeEmail(request: Request, user: RequestUser, dto: ChangeEmailDto): Promise<{
        success: boolean;
        userId: string;
        email: string;
        pendingEmail: string | undefined;
        verificationRequired: boolean;
    }>;
    confirmEmailChange(request: Request, dto: ConfirmEmailChangeDto): Promise<{
        success: boolean;
        userId: string;
        email: string;
    }>;
    changePassword(request: Request, user: RequestUser, dto: ChangePasswordDto, response: Response): Promise<{
        success: boolean;
        userId: string;
        email: string;
        role: string | undefined;
        accountType: string | undefined;
        companyId: string | undefined;
        apartmentId: string | undefined;
    }>;
}
