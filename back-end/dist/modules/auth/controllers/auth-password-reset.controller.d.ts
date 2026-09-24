import { Request, Response } from 'express';
import { ConfirmPasswordResetDto } from '../dto/confirm-password-reset.dto';
import { PreviewPasswordResetDto } from '../dto/preview-password-reset.dto';
import { SendPasswordResetDto } from '../dto/send-password-reset.dto';
import { AuthExceptionMapperService } from '../services/auth-exception-mapper.service';
import { AuthPasswordResetService } from '../services/auth-password-reset.service';
export declare class AuthPasswordResetController {
    private readonly passwordResetService;
    private readonly exceptionMapper;
    constructor(passwordResetService: AuthPasswordResetService, exceptionMapper: AuthExceptionMapperService);
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
