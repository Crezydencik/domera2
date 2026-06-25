"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const success_response_dto_1 = require("../../common/dto/success-response.dto");
const auth_extra_response_dto_1 = require("./dto/auth-extra-response.dto");
const register_email_code_request_dto_1 = require("./dto/register-email-code-request.dto");
const register_email_code_verify_dto_1 = require("./dto/register-email-code-verify.dto");
const send_password_reset_dto_1 = require("./dto/send-password-reset.dto");
const set_session_dto_1 = require("./dto/set-session.dto");
const login_dto_1 = require("./dto/login.dto");
const register_dto_1 = require("./dto/register.dto");
const confirm_password_reset_dto_1 = require("./dto/confirm-password-reset.dto");
const preview_password_reset_dto_1 = require("./dto/preview-password-reset.dto");
const change_email_dto_1 = require("./dto/change-email.dto");
const change_password_dto_1 = require("./dto/change-password.dto");
const confirm_email_change_dto_1 = require("./dto/confirm-email-change.dto");
const auth_service_1 = require("./auth.service");
const role_constants_1 = require("../../common/auth/role.constants");
const current_user_decorator_1 = require("../../common/auth/current-user.decorator");
const firebase_auth_guard_1 = require("../../common/auth/firebase-auth.guard");
const SESSION_COOKIE_NAME = '__session';
const ROLE_COOKIE_NAME = 'domera_role';
const ACCOUNT_TYPE_COOKIE_NAME = 'domera_accountType';
const COMPANY_COOKIE_NAME = 'domera_companyId';
const APARTMENT_COOKIE_NAME = 'domera_apartmentId';
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
function safeDocsNext(value) {
    const next = typeof value === 'string' ? value.trim() : '';
    return next.startsWith('/api/docs') ? next : '/api/docs';
}
function renderDocsLoginPage(params) {
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
let AuthController = class AuthController {
    constructor(authService) {
        this.authService = authService;
    }
    applySessionCookies(response, session) {
        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: session.maxAgeSeconds * 1000,
            path: '/',
        };
        response.cookie(SESSION_COOKIE_NAME, session.cookie, cookieOptions);
        if (session.role) {
            response.cookie(ROLE_COOKIE_NAME, session.role, cookieOptions);
        }
        else {
            response.clearCookie(ROLE_COOKIE_NAME, { path: '/' });
        }
        if (session.accountType) {
            response.cookie(ACCOUNT_TYPE_COOKIE_NAME, session.accountType, cookieOptions);
        }
        else {
            response.clearCookie(ACCOUNT_TYPE_COOKIE_NAME, { path: '/' });
        }
        if (session.companyId) {
            response.cookie(COMPANY_COOKIE_NAME, session.companyId, cookieOptions);
        }
        else {
            response.clearCookie(COMPANY_COOKIE_NAME, { path: '/' });
        }
        if (session.apartmentId) {
            response.cookie(APARTMENT_COOKIE_NAME, session.apartmentId, cookieOptions);
        }
        else {
            response.clearCookie(APARTMENT_COOKIE_NAME, { path: '/' });
        }
        response.clearCookie('authToken');
        response.clearCookie('userId');
        response.clearCookie('userEmail');
    }
    mapServiceError(error) {
        if (error instanceof common_1.HttpException)
            throw error;
        const message = error instanceof Error ? error.message : 'Unexpected auth error';
        console.error('Auth service error:', error);
        const statusCode = error?.statusCode;
        const retryAfter = error?.retryAfter;
        if (statusCode === 429) {
            throw new common_1.HttpException({
                statusCode: 429,
                message,
                retryAfter,
            }, common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
        if (statusCode === 401) {
            throw new common_1.HttpException({ statusCode: 401, message }, common_1.HttpStatus.UNAUTHORIZED);
        }
        if (statusCode === 403) {
            throw new common_1.HttpException({ statusCode: 403, message }, common_1.HttpStatus.FORBIDDEN);
        }
        if (statusCode === 409) {
            throw new common_1.HttpException({ statusCode: 409, message }, common_1.HttpStatus.CONFLICT);
        }
        if (statusCode === 404) {
            throw new common_1.HttpException({ statusCode: 404, message }, common_1.HttpStatus.NOT_FOUND);
        }
        if (statusCode === 410) {
            throw new common_1.HttpException({ statusCode: 410, message }, common_1.HttpStatus.GONE);
        }
        if (statusCode === 400) {
            throw new common_1.BadRequestException(message);
        }
        throw new common_1.HttpException({ statusCode: 500, message }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
    }
    getAccountCatalog() {
        return {
            accountTypes: role_constants_1.PUBLIC_REGISTRATION_ROLES,
            roles: role_constants_1.ROLE_CATALOG,
        };
    }
    docsLoginForm(request, response) {
        const next = safeDocsNext(request.query.next);
        response.type('html').send(renderDocsLoginPage({ next }));
    }
    async docsLogin(request, body, response) {
        const next = safeDocsNext(body.next);
        try {
            const result = await this.authService.loginWithEmailPassword(request, {
                email: body.email ?? '',
                password: body.password ?? '',
                rememberMe: true,
            });
            if (!(0, role_constants_1.isPlatformAdminRole)(result.session.role)) {
                this.clearCookies(response);
                response.status(common_1.HttpStatus.FORBIDDEN).type('html').send(renderDocsLoginPage({
                    next,
                    error: 'Platform administrator access required.',
                }));
                return;
            }
            this.applySessionCookies(response, result.session);
            response.redirect(next);
        }
        catch {
            response.status(common_1.HttpStatus.UNAUTHORIZED).type('html').send(renderDocsLoginPage({
                next,
                error: 'Invalid email or password.',
            }));
        }
    }
    async setCookies(dto, response) {
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
    createSession(dto, response) {
        return this.setCookies(dto, response);
    }
    clearCookies(response) {
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
    clearSession(response) {
        return this.clearCookies(response);
    }
    async login(request, dto, response) {
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
        }
        catch (error) {
            this.mapServiceError(error);
        }
    }
    async register(request, dto, response) {
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
        }
        catch (error) {
            this.mapServiceError(error);
        }
    }
    async changeEmail(request, user, dto, response) {
        try {
            const result = await this.authService.changeEmail(request, user, dto);
            return {
                success: true,
                userId: result.userId,
                email: result.email,
                pendingEmail: result.pendingEmail,
                verificationRequired: result.verificationRequired,
            };
        }
        catch (error) {
            this.mapServiceError(error);
        }
    }
    async confirmEmailChange(request, dto) {
        try {
            return await this.authService.confirmEmailChange(request, dto.token);
        }
        catch (error) {
            this.mapServiceError(error);
        }
    }
    async changePassword(request, user, dto, response) {
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
        }
        catch (error) {
            this.mapServiceError(error);
        }
    }
    async requestRegisterEmailCode(request, dto, response) {
        try {
            const data = await this.authService.requestRegisterEmailCode(request, dto);
            return data;
        }
        catch (error) {
            const retryAfter = error?.retryAfter;
            if (retryAfter) {
                response.setHeader('Retry-After', String(retryAfter));
            }
            this.mapServiceError(error);
        }
    }
    async verifyRegisterEmailCode(request, dto, response) {
        try {
            const data = await this.authService.verifyRegisterEmailCode(request, dto);
            return data;
        }
        catch (error) {
            const retryAfter = error?.retryAfter;
            if (retryAfter) {
                response.setHeader('Retry-After', String(retryAfter));
            }
            this.mapServiceError(error);
        }
    }
    async sendPasswordReset(request, dto, response) {
        try {
            return await this.authService.sendPasswordReset(request, dto);
        }
        catch (error) {
            const retryAfter = error?.retryAfter;
            if (retryAfter) {
                response.setHeader('Retry-After', String(retryAfter));
            }
            this.mapServiceError(error);
        }
    }
    async previewPasswordReset(request, dto) {
        try {
            return await this.authService.previewPasswordReset(request, dto.oobCode);
        }
        catch (error) {
            this.mapServiceError(error);
        }
    }
    async confirmPasswordReset(request, dto) {
        try {
            return await this.authService.confirmPasswordReset(request, dto);
        }
        catch (error) {
            this.mapServiceError(error);
        }
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.Get)('account-catalog'),
    (0, swagger_1.ApiOperation)({ summary: 'Get available account types and roles for registration and access control' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "getAccountCatalog", null);
__decorate([
    (0, common_1.Get)('docs-login'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "docsLoginForm", null);
__decorate([
    (0, common_1.Post)('docs-login'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "docsLogin", null);
__decorate([
    (0, common_1.Post)('set-cookies'),
    (0, swagger_1.ApiOperation)({ summary: 'Create secure Firebase session cookie from ID token' }),
    (0, swagger_1.ApiBody)({ type: set_session_dto_1.SetSessionDto }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Session cookie created successfully.',
        type: success_response_dto_1.SuccessResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [set_session_dto_1.SetSessionDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "setCookies", null);
__decorate([
    (0, common_1.Post)('session'),
    (0, swagger_1.ApiOperation)({ summary: 'Create session cookie using architecture-aligned endpoint' }),
    (0, swagger_1.ApiBody)({ type: set_session_dto_1.SetSessionDto }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Session created successfully.',
        type: success_response_dto_1.SuccessResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [set_session_dto_1.SetSessionDto, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "createSession", null);
__decorate([
    (0, common_1.Post)('clear-cookies'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Clear auth and session cookies' }),
    (0, swagger_1.ApiCookieAuth)('__session'),
    (0, swagger_1.ApiOkResponse)({
        description: 'Cookies cleared successfully.',
        type: success_response_dto_1.SuccessResponseDto,
    }),
    __param(0, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "clearCookies", null);
__decorate([
    (0, common_1.Delete)('session'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Clear session using architecture-aligned endpoint' }),
    (0, swagger_1.ApiCookieAuth)('__session'),
    (0, swagger_1.ApiOkResponse)({
        description: 'Session cleared successfully.',
        type: success_response_dto_1.SuccessResponseDto,
    }),
    __param(0, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "clearSession", null);
__decorate([
    (0, common_1.Post)('login'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Sign in using email and password through the backend Firebase bridge' }),
    (0, swagger_1.ApiBody)({ type: login_dto_1.LoginDto }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, login_dto_1.LoginDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "login", null);
__decorate([
    (0, common_1.Post)('register'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, swagger_1.ApiOperation)({ summary: 'Register a new Firebase user and create the profile through the backend' }),
    (0, swagger_1.ApiBody)({ type: register_dto_1.RegisterDto }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, register_dto_1.RegisterDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "register", null);
__decorate([
    (0, common_1.Patch)('me/email'),
    (0, common_1.UseGuards)(firebase_auth_guard_1.FirebaseAuthGuard),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Change the authenticated user email' }),
    (0, swagger_1.ApiBody)({ type: change_email_dto_1.ChangeEmailDto }),
    (0, swagger_1.ApiCookieAuth)('__session'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, change_email_dto_1.ChangeEmailDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "changeEmail", null);
__decorate([
    (0, common_1.Post)('me/email/confirm'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Confirm an email change using the verification link token' }),
    (0, swagger_1.ApiBody)({ type: confirm_email_change_dto_1.ConfirmEmailChangeDto }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, confirm_email_change_dto_1.ConfirmEmailChangeDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "confirmEmailChange", null);
__decorate([
    (0, common_1.Patch)('me/password'),
    (0, common_1.UseGuards)(firebase_auth_guard_1.FirebaseAuthGuard),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Change the authenticated user password' }),
    (0, swagger_1.ApiBody)({ type: change_password_dto_1.ChangePasswordDto }),
    (0, swagger_1.ApiCookieAuth)('__session'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, change_password_dto_1.ChangePasswordDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "changePassword", null);
__decorate([
    (0, common_1.Post)('register-email-code/request'),
    (0, swagger_1.ApiOperation)({ summary: 'Send registration email verification code' }),
    (0, swagger_1.ApiBody)({ type: register_email_code_request_dto_1.RegisterEmailCodeRequestDto }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Verification code sent successfully.',
        type: auth_extra_response_dto_1.RegisterEmailCodeRequestResponseDto,
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, register_email_code_request_dto_1.RegisterEmailCodeRequestDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "requestRegisterEmailCode", null);
__decorate([
    (0, common_1.Post)('register-email-code/verify'),
    (0, swagger_1.ApiOperation)({ summary: 'Verify registration email code' }),
    (0, swagger_1.ApiBody)({ type: register_email_code_verify_dto_1.RegisterEmailCodeVerifyDto }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Verification code accepted.',
        type: auth_extra_response_dto_1.RegisterEmailCodeVerifyResponseDto,
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, register_email_code_verify_dto_1.RegisterEmailCodeVerifyDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "verifyRegisterEmailCode", null);
__decorate([
    (0, common_1.Post)('send-password-reset'),
    (0, swagger_1.ApiOperation)({ summary: 'Send password reset email' }),
    (0, swagger_1.ApiBody)({ type: send_password_reset_dto_1.SendPasswordResetDto }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Password reset email sent.',
        type: auth_extra_response_dto_1.SendPasswordResetResponseDto,
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, send_password_reset_dto_1.SendPasswordResetDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "sendPasswordReset", null);
__decorate([
    (0, common_1.Post)('preview-password-reset'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Preview the password reset target email through the backend' }),
    (0, swagger_1.ApiBody)({ type: preview_password_reset_dto_1.PreviewPasswordResetDto }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, preview_password_reset_dto_1.PreviewPasswordResetDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "previewPasswordReset", null);
__decorate([
    (0, common_1.Post)('confirm-password-reset'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Confirm Firebase password reset through the backend' }),
    (0, swagger_1.ApiBody)({ type: confirm_password_reset_dto_1.ConfirmPasswordResetDto }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, confirm_password_reset_dto_1.ConfirmPasswordResetDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "confirmPasswordReset", null);
exports.AuthController = AuthController = __decorate([
    (0, swagger_1.ApiTags)('Auth'),
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [auth_service_1.AuthService])
], AuthController);
