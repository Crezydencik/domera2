import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { AuditLogService } from '../../../common/services/audit-log.service';
import { RateLimitService } from '../../../common/services/rate-limit.service';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { ConfirmPasswordResetDto } from '../dto/confirm-password-reset.dto';
import { SendPasswordResetDto } from '../dto/send-password-reset.dto';
import { AuthEmailService } from './auth-email.service';
import { FirebaseIdentityToolkitService } from './firebase-identity-toolkit.service';

@Injectable()
export class AuthPasswordResetService {
  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly configService: ConfigService,
    private readonly rateLimitService: RateLimitService,
    private readonly auditLogService: AuditLogService,
    private readonly authEmailService: AuthEmailService,
    private readonly identityToolkitService: FirebaseIdentityToolkitService,
  ) {}

  async previewPasswordReset(request: Request, oobCode: string) {
    const result = await this.identityToolkitService.call<{ email?: string }>('resetPassword', {
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

  async confirmPasswordReset(request: Request, input: ConfirmPasswordResetDto) {
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

  async sendPasswordReset(request: Request, input: SendPasswordResetDto) {
    const email = this.normalizeEmail(input.email ?? '');

    try {
      const rl = await this.rateLimitService.consume(
        this.rateLimitService.buildKey(request, 'auth:password-reset', email || 'anon'),
        6,
        60_000,
      );

      if (!rl.allowed) {
        const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
        const error = new Error('Too many requests');
        (error as Error & { statusCode?: number; retryAfter?: number }).statusCode = 429;
        (error as Error & { statusCode?: number; retryAfter?: number }).retryAfter = retryAfter;
        throw error;
      }
    } catch (error) {
      if ((error as { statusCode?: number } | undefined)?.statusCode === 429) {
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

    const origin = (
      this.configService.get<string>('APP_URL')?.trim() ||
      this.configService.get<string>('FRONTEND_URL')?.trim() ||
      'https://domera.app'
    ).replace(/\/+$/, '');

    let firebaseResetLink: string;

    try {
      firebaseResetLink = await this.firebaseAdminService.auth.generatePasswordResetLink(email);
    } catch (error) {
      const code = (error as { code?: string } | undefined)?.code;

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
    } catch {
      resetLink = firebaseResetLink;
    }

    const lang = await this.resolvePasswordResetLanguage(email);
    let errorMessage: string | undefined;

    try {
      ({ errorMessage } = await this.authEmailService.sendPasswordReset(email, lang, resetLink));
    } catch (error) {
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

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private buildCustomResetLink(origin: string, firebaseResetLink: string, email?: string): string {
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

  private async resolvePasswordResetLanguage(email: string): Promise<'ru' | 'lv'> {
    try {
      const usersSnap = await this.firebaseAdminService.firestore
        .collection('users')
        .where('email', '==', email)
        .limit(1)
        .get();
      const preferredLang = usersSnap.empty
        ? undefined
        : (usersSnap.docs[0].data().preferredLang as string | undefined);
      return preferredLang === 'ru' ? 'ru' : 'lv';
    } catch {
      return 'lv';
    }
  }
}
