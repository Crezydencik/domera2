import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import {
  passwordResetTemplates,
  registrationCodeTemplates,
} from '../../emails/templates';
import {
  button,
  note,
  paragraph,
  renderEmailLayout,
} from '../../emails/templates/email-layout.template';

type RegistrationLocale = 'en' | 'ru' | 'lv';

@Injectable()
export class AuthEmailService {
  constructor(private readonly configService: ConfigService) {}

  async sendRegistrationCode(email: string, locale: RegistrationLocale, code: string): Promise<{ errorMessage?: string }> {
    const template = registrationCodeTemplates[locale](code);
    return this.sendEmail(email, template.subject, template.html);
  }

  async sendEmailChangeVerification(email: string, link: string): Promise<{ errorMessage?: string }> {
    const template = this.getEmailChangeTemplate(link);
    return this.sendEmail(email, template.subject, template.html);
  }

  async sendPasswordReset(email: string, lang: 'ru' | 'lv', resetLink: string): Promise<{ errorMessage?: string }> {
    const template = passwordResetTemplates[lang](resetLink);
    return this.sendEmail(email, template.subject, template.html);
  }

  private async sendEmail(
    to: string,
    subject: string,
    html: string,
  ): Promise<{ errorMessage?: string }> {
    const resendConfig = this.getResendConfig();
    const resend = new Resend(resendConfig.apiKey);
    const { error } = await resend.emails.send({
      from: resendConfig.from,
      to,
      subject,
      html,
    });

    if (error) {
      return { errorMessage: error.message };
    }

    return {};
  }

  private getEmailChangeTemplate(link: string): { subject: string; html: string } {
    return {
      subject: 'Domera e-pasta mainas apstiprinasana',
      html: renderEmailLayout({
        language: 'lv',
        title: 'Apstipriniet e-pasta mainu',
        badge: 'Drosiba',
        children: `
          ${paragraph('Lai mainitu savu Domera konta e-pastu, nospiediet pogu zemak.')}
          ${button('Apstiprinat e-pastu', link)}
          ${note('Saite ir deriga 30 minutes. Ja neesat pieprasijis e-pasta mainu, varat ignoret so zinojumu.')}
        `,
      }),
    };
  }

  private getResendConfig(): { apiKey: string; from: string } {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    const from = this.configService.get<string>('RESEND_FROM');
    const allowedDomain = this.configService.get<string>('RESEND_ALLOWED_DOMAIN') ?? 'lumtach.com';

    if (!apiKey || !from) {
      throw new Error('Resend is not configured. Please set RESEND_API_KEY and RESEND_FROM');
    }

    if (!this.isAllowedSenderDomain(from, allowedDomain)) {
      throw new Error(`Invalid RESEND_FROM: sender domain must be ${allowedDomain}`);
    }

    return { apiKey, from };
  }

  private isAllowedSenderDomain(from: string, allowedDomain: string): boolean {
    const email = this.extractEmailFromFromField(from);
    const atIndex = email.lastIndexOf('@');
    if (atIndex === -1) return false;
    const domain = email.slice(atIndex + 1);
    return domain === allowedDomain.toLowerCase();
  }

  private extractEmailFromFromField(from: string): string {
    const trimmed = from.trim();
    const angleBracketMatch = trimmed.match(/<([^>]+)>/);
    return (angleBracketMatch?.[1] ?? trimmed).trim().toLowerCase();
  }
}
