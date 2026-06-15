import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiBody,
} from '@nestjs/swagger';
import { SuccessResponseDto } from '../../common/dto/success-response.dto';
import {
  RegisterEmailCodeRequestResponseDto,
  RegisterEmailCodeVerifyResponseDto,
  SendPasswordResetResponseDto,
} from './dto/auth-extra-response.dto';
import { RegisterEmailCodeRequestDto } from './dto/register-email-code-request.dto';
import { RegisterEmailCodeVerifyDto } from './dto/register-email-code-verify.dto';
import { SendPasswordResetDto } from './dto/send-password-reset.dto';
import { SetSessionDto } from './dto/set-session.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ConfirmPasswordResetDto } from './dto/confirm-password-reset.dto';
import { PreviewPasswordResetDto } from './dto/preview-password-reset.dto';
import { ChangeEmailDto } from './dto/change-email.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ConfirmEmailChangeDto } from './dto/confirm-email-change.dto';
import { AuthService } from './auth.service';
import { PUBLIC_REGISTRATION_ROLES, ROLE_CATALOG } from '../../common/auth/role.constants';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { FirebaseAuthGuard } from '../../common/auth/firebase-auth.guard';
import { RequestUser } from '../../common/auth/request-user.type';

const SESSION_COOKIE_NAME = '__session';
const ROLE_COOKIE_NAME = 'domera_role';
const ACCOUNT_TYPE_COOKIE_NAME = 'domera_accountType';
const COMPANY_COOKIE_NAME = 'domera_companyId';
const APARTMENT_COOKIE_NAME = 'domera_apartmentId';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private applySessionCookies(
    response: Response,
    session: {
      cookie: string;
      maxAgeSeconds: number;
      role?: string;
      accountType?: string;
      companyId?: string;
      apartmentId?: string;
    },
  ) {
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict' as const,
      maxAge: session.maxAgeSeconds * 1000,
      path: '/',
    };

    response.cookie(SESSION_COOKIE_NAME, session.cookie, cookieOptions);

    if (session.role) {
      response.cookie(ROLE_COOKIE_NAME, session.role, cookieOptions);
    } else {
      response.clearCookie(ROLE_COOKIE_NAME, { path: '/' });
    }

    if (session.accountType) {
      response.cookie(ACCOUNT_TYPE_COOKIE_NAME, session.accountType, cookieOptions);
    } else {
      response.clearCookie(ACCOUNT_TYPE_COOKIE_NAME, { path: '/' });
    }

    if (session.companyId) {
      response.cookie(COMPANY_COOKIE_NAME, session.companyId, cookieOptions);
    } else {
      response.clearCookie(COMPANY_COOKIE_NAME, { path: '/' });
    }

    if (session.apartmentId) {
      response.cookie(APARTMENT_COOKIE_NAME, session.apartmentId, cookieOptions);
    } else {
      response.clearCookie(APARTMENT_COOKIE_NAME, { path: '/' });
    }

    response.clearCookie('authToken');
    response.clearCookie('userId');
    response.clearCookie('userEmail');
  }

  private mapServiceError(error: unknown): never {
    if (error instanceof HttpException) throw error;

    const message = error instanceof Error ? error.message : 'Unexpected auth error';
    console.error('Auth service error:', error);
    const statusCode = (error as { statusCode?: number } | undefined)?.statusCode;
    const retryAfter = (error as { retryAfter?: number } | undefined)?.retryAfter;

    if (statusCode === 429) {
      throw new HttpException(
        {
          statusCode: 429,
          message,
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (statusCode === 401) {
      throw new HttpException({ statusCode: 401, message }, HttpStatus.UNAUTHORIZED);
    }

    if (statusCode === 403) {
      throw new HttpException({ statusCode: 403, message }, HttpStatus.FORBIDDEN);
    }

    if (statusCode === 409) {
      throw new HttpException({ statusCode: 409, message }, HttpStatus.CONFLICT);
    }

    if (statusCode === 404) {
      throw new HttpException({ statusCode: 404, message }, HttpStatus.NOT_FOUND);
    }

    if (statusCode === 410) {
      throw new HttpException({ statusCode: 410, message }, HttpStatus.GONE);
    }

    if (statusCode === 400) {
      throw new BadRequestException(message);
    }

    throw new HttpException({ statusCode: 500, message }, HttpStatus.INTERNAL_SERVER_ERROR);
  }

  @Get('account-catalog')
  @ApiOperation({ summary: 'Get available account types and roles for registration and access control' })
  getAccountCatalog() {
    return {
      accountTypes: PUBLIC_REGISTRATION_ROLES,
      roles: ROLE_CATALOG,
    };
  }

  @Post('set-cookies')
  @ApiOperation({ summary: 'Create secure Firebase session cookie from ID token' })
  @ApiBody({ type: SetSessionDto })
  @ApiOkResponse({
    description: 'Session cookie created successfully.',
    type: SuccessResponseDto,
  })
  async setCookies(@Body() dto: SetSessionDto, @Res({ passthrough: true }) response: Response) {
    const session = await this.authService.createSessionCookie(dto);
    this.applySessionCookies(response, session);

    return {
      success: true,
      role: session.role,
      accountType: session.accountType,
      companyId: session.companyId,
      apartmentId: session.apartmentId,
    };
  }

  @Post('session')
  @ApiOperation({ summary: 'Create session cookie using architecture-aligned endpoint' })
  @ApiBody({ type: SetSessionDto })
  @ApiOkResponse({
    description: 'Session created successfully.',
    type: SuccessResponseDto,
  })
  createSession(@Body() dto: SetSessionDto, @Res({ passthrough: true }) response: Response) {
    return this.setCookies(dto, response);
  }

  @Post('clear-cookies')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clear auth and session cookies' })
  @ApiCookieAuth('__session')
  @ApiOkResponse({
    description: 'Cookies cleared successfully.',
    type: SuccessResponseDto,
  })
  clearCookies(@Res({ passthrough: true }) response: Response) {
    response.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    response.clearCookie(ROLE_COOKIE_NAME, { path: '/' });
    response.clearCookie(ACCOUNT_TYPE_COOKIE_NAME, { path: '/' });
    response.clearCookie(COMPANY_COOKIE_NAME, { path: '/' });
    response.clearCookie(APARTMENT_COOKIE_NAME, { path: '/' });
    response.clearCookie('authToken', { path: '/' });
    response.clearCookie('userId', { path: '/' });
    response.clearCookie('userEmail', { path: '/' });

    return { success: true };
  }

  @Delete('session')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clear session using architecture-aligned endpoint' })
  @ApiCookieAuth('__session')
  @ApiOkResponse({
    description: 'Session cleared successfully.',
    type: SuccessResponseDto,
  })
  clearSession(@Res({ passthrough: true }) response: Response) {
    return this.clearCookies(response);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in using email and password through the backend Firebase bridge' })
  @ApiBody({ type: LoginDto })
  async login(
    @Req() request: Request,
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      const result = await this.authService.loginWithEmailPassword(request, dto);
      this.applySessionCookies(response, result.session);
      return {
        success: true,
        userId: result.userId,
        email: result.email,
        role: result.session.role,
        accountType: result.session.accountType,
        companyId: result.session.companyId,
        apartmentId: result.session.apartmentId,
      };
    } catch (error) {
      this.mapServiceError(error);
    }
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new Firebase user and create the profile through the backend' })
  @ApiBody({ type: RegisterDto })
  async register(
    @Req() request: Request,
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      const result = await this.authService.registerWithEmailPassword(request, dto);
      this.applySessionCookies(response, result.session);
      return {
        success: true,
        userId: result.userId,
        email: result.email,
        role: result.session.role,
        accountType: result.session.accountType,
        companyId: result.session.companyId,
        apartmentId: result.session.apartmentId,
      };
    } catch (error) {
      this.mapServiceError(error);
    }
  }

  @Patch('me/email')
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change the authenticated user email' })
  @ApiBody({ type: ChangeEmailDto })
  @ApiCookieAuth('__session')
  async changeEmail(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Body() dto: ChangeEmailDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      const result = await this.authService.changeEmail(request, user, dto);
      return {
        success: true,
        userId: result.userId,
        email: result.email,
        pendingEmail: result.pendingEmail,
        verificationRequired: result.verificationRequired,
      };
    } catch (error) {
      this.mapServiceError(error);
    }
  }

  @Post('me/email/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm an email change using the verification link token' })
  @ApiBody({ type: ConfirmEmailChangeDto })
  async confirmEmailChange(
    @Req() request: Request,
    @Body() dto: ConfirmEmailChangeDto,
  ) {
    try {
      return await this.authService.confirmEmailChange(request, dto.token);
    } catch (error) {
      this.mapServiceError(error);
    }
  }

  @Patch('me/password')
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change the authenticated user password' })
  @ApiBody({ type: ChangePasswordDto })
  @ApiCookieAuth('__session')
  async changePassword(
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      const result = await this.authService.changePassword(request, user, dto);
      this.applySessionCookies(response, result.session);
      return {
        success: true,
        userId: result.userId,
        email: result.email,
        role: result.session.role,
        accountType: result.session.accountType,
        companyId: result.session.companyId,
        apartmentId: result.session.apartmentId,
      };
    } catch (error) {
      this.mapServiceError(error);
    }
  }

  @Post('register-email-code/request')
  @ApiOperation({ summary: 'Send registration email verification code' })
  @ApiBody({ type: RegisterEmailCodeRequestDto })
  @ApiOkResponse({
    description: 'Verification code sent successfully.',
    type: RegisterEmailCodeRequestResponseDto,
  })
  async requestRegisterEmailCode(
    @Req() request: Request,
    @Body() dto: RegisterEmailCodeRequestDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      const data = await this.authService.requestRegisterEmailCode(request, dto);
      return data;
    } catch (error) {
      const retryAfter = (error as { retryAfter?: number } | undefined)?.retryAfter;
      if (retryAfter) {
        response.setHeader('Retry-After', String(retryAfter));
      }
      this.mapServiceError(error);
    }
  }

  @Post('register-email-code/verify')
  @ApiOperation({ summary: 'Verify registration email code' })
  @ApiBody({ type: RegisterEmailCodeVerifyDto })
  @ApiOkResponse({
    description: 'Verification code accepted.',
    type: RegisterEmailCodeVerifyResponseDto,
  })
  async verifyRegisterEmailCode(
    @Req() request: Request,
    @Body() dto: RegisterEmailCodeVerifyDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      const data = await this.authService.verifyRegisterEmailCode(request, dto);
      return data;
    } catch (error) {
      const retryAfter = (error as { retryAfter?: number } | undefined)?.retryAfter;
      if (retryAfter) {
        response.setHeader('Retry-After', String(retryAfter));
      }
      this.mapServiceError(error);
    }
  }

  @Post('send-password-reset')
  @ApiOperation({ summary: 'Send password reset email' })
  @ApiBody({ type: SendPasswordResetDto })
  @ApiOkResponse({
    description: 'Password reset email sent.',
    type: SendPasswordResetResponseDto,
  })
  async sendPasswordReset(
    @Req() request: Request,
    @Body() dto: SendPasswordResetDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      return await this.authService.sendPasswordReset(request, dto);
    } catch (error) {
      const retryAfter = (error as { retryAfter?: number } | undefined)?.retryAfter;
      if (retryAfter) {
        response.setHeader('Retry-After', String(retryAfter));
      }
      this.mapServiceError(error);
    }
  }

  @Post('preview-password-reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Preview the password reset target email through the backend' })
  @ApiBody({ type: PreviewPasswordResetDto })
  async previewPasswordReset(
    @Req() request: Request,
    @Body() dto: PreviewPasswordResetDto,
  ) {
    try {
      return await this.authService.previewPasswordReset(request, dto.oobCode);
    } catch (error) {
      this.mapServiceError(error);
    }
  }

  @Post('confirm-password-reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm Firebase password reset through the backend' })
  @ApiBody({ type: ConfirmPasswordResetDto })
  async confirmPasswordReset(
    @Req() request: Request,
    @Body() dto: ConfirmPasswordResetDto,
  ) {
    try {
      return await this.authService.confirmPasswordReset(request, dto);
    } catch (error) {
      this.mapServiceError(error);
    }
  }
}
