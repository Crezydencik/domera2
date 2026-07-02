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
import { isPlatformAdminRole, PUBLIC_REGISTRATION_ROLES, ROLE_CATALOG } from '../../common/auth/role.constants';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { FirebaseAuthGuard } from '../../common/auth/firebase-auth.guard';
import { RequestUser } from '../../common/auth/request-user.type';

const SESSION_COOKIE_NAME = '__session';
const ROLE_COOKIE_NAME = 'domera_role';
const ACCOUNT_TYPE_COOKIE_NAME = 'domera_accountType';
const COMPANY_COOKIE_NAME = 'domera_companyId';
const APARTMENT_COOKIE_NAME = 'domera_apartmentId';
const SESSION_MARKER_COOKIE_NAME = 'domera_session';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeDocsNext(value: unknown): string {
  const next = typeof value === 'string' ? value.trim() : '';
  return next.startsWith('/api/docs') ? next : '/api/docs';
}

function renderDocsLoginPage(params: { next: string; error?: string }):
  string {
  const error = `<p class="error" role="alert"${params.error ? '' : ' hidden'}>${escapeHtml(params.error)}</p>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Domera Swagger Login</title>
  <style>
    :root { color-scheme: light; font-family: Arial, sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f6f8fb; color: #172033; }
    main { width: min(420px, calc(100vw - 32px)); background: white; border: 1px solid #dbe3ee; border-radius: 8px; padding: 28px; box-shadow: 0 18px 50px rgba(20, 30, 50, .08); }
    h1 { margin: 0 0 8px; font-size: 24px; line-height: 1.2; }
    p { margin: 0 0 22px; color: #5d6b82; line-height: 1.5; }
    label { display: block; margin: 16px 0 6px; font-size: 14px; font-weight: 700; }
    input { box-sizing: border-box; width: 100%; height: 42px; border: 1px solid #c8d2df; border-radius: 6px; padding: 0 12px; font-size: 15px; }
    button { width: 100%; height: 44px; margin-top: 22px; border: 0; border-radius: 6px; background: #0f62fe; color: white; font-size: 15px; font-weight: 700; cursor: pointer; }
    button:hover { background: #004bd6; }
    .error { margin: 0 0 16px; padding: 10px 12px; border-radius: 6px; background: #fff1f1; color: #b42318; font-size: 14px; }
  </style>
</head>
<body>
  <main>
    <h1>Swagger access</h1>
    <p>Sign in with a platform administrator account.</p>
    ${error}
    <form id="docs-login-form" method="post" action="/api/auth/login">
      <input type="hidden" name="next" value="${escapeHtml(params.next)}">
      <label for="email">Email</label>
      <input id="email" name="email" type="email" autocomplete="username" required autofocus>
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required>
      <button type="submit">Open Swagger</button>
    </form>
  </main>
  <script>
    const form = document.getElementById('docs-login-form');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: String(formData.get('email') || ''),
          password: String(formData.get('password') || ''),
          rememberMe: true
        })
      });

      if (response.ok) {
        window.location.assign(String(formData.get('next') || '/api/docs'));
        return;
      }

      const payload = await response.json().catch(() => null);
      const message = payload && payload.message ? payload.message : 'Invalid email or password.';
      const errorBox = document.querySelector('.error');
      if (errorBox) {
        errorBox.hidden = false;
        errorBox.textContent = Array.isArray(message) ? message.join(', ') : String(message);
      }
    });
  </script>
</body>
</html>`;
}

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
      sameSite: process.env.NODE_ENV === 'production' ? 'none' as const : 'lax' as const,
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

    response.clearCookie(SESSION_MARKER_COOKIE_NAME, { path: '/' });
    response.clearCookie('authToken', { path: '/' });
    response.clearCookie('userId', { path: '/' });
    response.clearCookie('userEmail', { path: '/' });
    response.clearCookie('userName', { path: '/' });
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

  @Get('docs-login')
  docsLoginForm(@Req() request: Request, @Res() response: Response) {
    const next = safeDocsNext(request.query.next);
    response.type('html').send(renderDocsLoginPage({ next }));
  }

  @Post('docs-login')
  async docsLogin(
    @Req() request: Request,
    @Body() body: { email?: string; password?: string; next?: string },
    @Res() response: Response,
  ) {
    const next = safeDocsNext(body.next);
    try {
      const result = await this.authService.loginWithEmailPassword(request, {
        email: body.email ?? '',
        password: body.password ?? '',
        rememberMe: true,
      });

      if (!isPlatformAdminRole(result.session.role)) {
        this.clearCookies(response);
        response.status(HttpStatus.FORBIDDEN).type('html').send(
          renderDocsLoginPage({
            next,
            error: 'Platform administrator access required.',
          }),
        );
        return;
      }

      this.applySessionCookies(response, result.session);
      response.redirect(next);
    } catch {
      response.status(HttpStatus.UNAUTHORIZED).type('html').send(
        renderDocsLoginPage({
          next,
          error: 'Invalid email or password.',
        }),
      );
    }
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
    response.clearCookie(SESSION_MARKER_COOKIE_NAME, { path: '/' });
    response.clearCookie('authToken', { path: '/' });
    response.clearCookie('userId', { path: '/' });
    response.clearCookie('userEmail', { path: '/' });
    response.clearCookie('userName', { path: '/' });

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
