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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthPasswordResetService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const audit_log_service_1 = require("../../../common/services/audit-log.service");
const rate_limit_service_1 = require("../../../common/services/rate-limit.service");
const firebase_admin_service_1 = require("../../../common/infrastructure/firebase/firebase-admin.service");
const auth_email_service_1 = require("./auth-email.service");
const firebase_identity_toolkit_service_1 = require("./firebase-identity-toolkit.service");
let AuthPasswordResetService = class AuthPasswordResetService {
    constructor(firebaseAdminService, configService, rateLimitService, auditLogService, authEmailService, identityToolkitService) {
        this.firebaseAdminService = firebaseAdminService;
        this.configService = configService;
        this.rateLimitService = rateLimitService;
        this.auditLogService = auditLogService;
        this.authEmailService = authEmailService;
        this.identityToolkitService = identityToolkitService;
    }
    async previewPasswordReset(request, oobCode) {
        const result = await this.identityToolkitService.call('resetPassword', {
            oobCode,
        });
        void this.auditLogService.write({
            request,
            action: 'auth.password_reset_preview',
            status: 'success',
            targetEmail: result.email,
        });
        return {
            email: result.email ? this.normalizeEmail(result.email) : '',
        };
    }
    async confirmPasswordReset(request, input) {
        await this.identityToolkitService.call('resetPassword', {
            oobCode: input.oobCode,
            newPassword: input.newPassword,
        });
        void this.auditLogService.write({
            request,
            action: 'auth.password_reset_confirm',
            status: 'success',
        });
        return { success: true };
    }
    async sendPasswordReset(request, input) {
        const email = this.normalizeEmail(input.email ?? '');
        try {
            const rl = await this.rateLimitService.consume(this.rateLimitService.buildKey(request, 'auth:password-reset', email || 'anon'), 6, 60_000);
            if (!rl.allowed) {
                const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
                const error = new Error('Too many requests');
                error.statusCode = 429;
                error.retryAfter = retryAfter;
                throw error;
            }
        }
        catch (error) {
            if (error?.statusCode === 429) {
                throw error;
            }
            void this.auditLogService.write({
                request,
                action: 'auth.password_reset_send',
                status: 'error',
                targetEmail: email,
                metadata: {
                    skipped: 'rate-limit-unavailable',
                    providerMessage: error instanceof Error ? error.message : 'unknown',
                },
            });
        }
        const origin = (this.configService.get('APP_URL')?.trim() ||
            this.configService.get('FRONTEND_URL')?.trim() ||
            'https://domera.app').replace(/\/+$/, '');
        let firebaseResetLink;
        try {
            firebaseResetLink = await this.firebaseAdminService.auth.generatePasswordResetLink(email);
        }
        catch (error) {
            const code = error?.code;
            void this.auditLogService.write({
                request,
                action: 'auth.password_reset_send',
                status: 'success',
                targetEmail: email,
                metadata: {
                    skipped: code === 'auth/user-not-found' ? 'user-not-found' : 'link-generation-failed',
                    providerCode: code,
                },
            });
            return { success: true, message: 'Vēstule nosūtīta' };
        }
        let resetLink = firebaseResetLink;
        try {
            resetLink = this.buildCustomResetLink(origin, firebaseResetLink, email);
        }
        catch {
            resetLink = firebaseResetLink;
        }
        const lang = await this.resolvePasswordResetLanguage(email);
        let errorMessage;
        try {
            ({ errorMessage } = await this.authEmailService.sendPasswordReset(email, lang, resetLink));
        }
        catch (error) {
            void this.auditLogService.write({
                request,
                action: 'auth.password_reset_send',
                status: 'success',
                targetEmail: email,
                metadata: {
                    skipped: 'resend-exception',
                    providerMessage: error instanceof Error ? error.message : 'unknown',
                    lang,
                },
            });
            return { success: true, message: 'Vēstule nosūtīta' };
        }
        if (errorMessage) {
            void this.auditLogService.write({
                request,
                action: 'auth.password_reset_send',
                status: 'success',
                targetEmail: email,
                metadata: { skipped: 'resend-error', providerMessage: errorMessage, lang },
            });
            return { success: true, message: 'Vēstule nosūtīta' };
        }
        void this.auditLogService.write({
            request,
            action: 'auth.password_reset_send',
            status: 'success',
            targetEmail: email,
            metadata: { lang },
        });
        return { success: true, message: 'Vēstule nosūtīta' };
    }
    normalizeEmail(email) {
        return email.trim().toLowerCase();
    }
    buildCustomResetLink(origin, firebaseResetLink, email) {
        const parsed = new URL(firebaseResetLink);
        const oobCode = parsed.searchParams.get('oobCode');
        if (!oobCode) {
            throw new Error('Failed to build password reset link');
        }
        const customUrl = new URL('/reset-password/confirm', origin);
        customUrl.searchParams.set('oobCode', oobCode);
        if (email?.trim()) {
            customUrl.searchParams.set('email', this.normalizeEmail(email));
        }
        return customUrl.toString();
    }
    async resolvePasswordResetLanguage(email) {
        try {
            const usersSnap = await this.firebaseAdminService.firestore
                .collection('users')
                .where('email', '==', email)
                .limit(1)
                .get();
            const preferredLang = usersSnap.empty
                ? undefined
                : usersSnap.docs[0].data().preferredLang;
            return preferredLang === 'ru' ? 'ru' : 'lv';
        }
        catch {
            return 'lv';
        }
    }
};
exports.AuthPasswordResetService = AuthPasswordResetService;
exports.AuthPasswordResetService = AuthPasswordResetService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [firebase_admin_service_1.FirebaseAdminService,
        config_1.ConfigService,
        rate_limit_service_1.RateLimitService,
        audit_log_service_1.AuditLogService,
        auth_email_service_1.AuthEmailService,
        firebase_identity_toolkit_service_1.FirebaseIdentityToolkitService])
], AuthPasswordResetService);
