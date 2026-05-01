import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { EmailLanguage, EmailPayload, EmailType, EmailTemplate } from './email.types';
import * as templates from './templates';
import {
  SendRegistrationCodeEmailDto,
  SendPasswordResetEmailDto,
  SendOwnerInvitationEmailDto,
  SendTenantInvitationEmailDto,
  SendTenantInvitedByOwnerEmailDto,
  SendInvoiceGeneratedEmailDto,
  SendMeterReadingReminderEmailDto,
  SendNotificationEmailDto,
  SendEmailDto,
} from './dto/send-email.dto';

@Injectable()
export class EmailService {
  private resend!: Resend;
  private readonly from: string;
  private readonly apiKey: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('RESEND_API_KEY') || '';
    this.from = this.configService.get<string>('RESEND_FROM') || '';

    if (this.apiKey && this.from) {
      this.resend = new Resend(this.apiKey);
    }
  }

  /**
   * Generic method to send any email
   */
  async send(payload: SendEmailDto): Promise<{ id: string }> {
    if (!this.resend || !this.apiKey || !this.from) {
      throw new Error('Email service is not configured. Set RESEND_API_KEY and RESEND_FROM.');
    }

    try {
      const response = await this.resend.emails.send({
        from: this.from,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
      });

      if (response.error) {
        throw new Error(`Resend error: ${response.error.message}`);
      }

      return { id: response.data?.id || '' };
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  }

  /**
   * Send registration code email
   */
  async sendRegistrationCode(dto: SendRegistrationCodeEmailDto): Promise<{ id: string }> {
    const language = this.normalizeLanguage(dto.language);
    const template = templates.registrationCodeTemplates[language](dto.code);

    return this.send({
      to: dto.to,
      subject: template.subject,
      html: template.html,
    });
  }

  /**
   * Send password reset email
   */
  async sendPasswordReset(dto: SendPasswordResetEmailDto): Promise<{ id: string }> {
    const language = this.normalizeLanguage(dto.language);
    const template = templates.passwordResetTemplates[language](dto.resetLink);

    return this.send({
      to: dto.to,
      subject: template.subject,
      html: template.html,
    });
  }

  /**
   * Send owner invitation email
   */
  async sendOwnerInvitation(dto: SendOwnerInvitationEmailDto): Promise<{ id: string }> {
    const language = this.normalizeLanguage(dto.language);
    const template = templates.ownerInvitationTemplates[language]({
      companyName: dto.companyName,
      invitationLink: dto.invitationLink,
      senderName: dto.senderName,
    });

    return this.send({
      to: dto.to,
      subject: template.subject,
      html: template.html,
    });
  }

  /**
   * Send tenant invitation email
   */
  async sendTenantInvitation(dto: SendTenantInvitationEmailDto): Promise<{ id: string }> {
    const language = this.normalizeLanguage(dto.language);
    const template = templates.tenantInvitationTemplates[language]({
      companyName: dto.companyName,
      buildingName: dto.buildingName,
      apartmentNumber: dto.apartmentNumber,
      invitationLink: dto.invitationLink,
      senderName: dto.senderName,
    });

    return this.send({
      to: dto.to,
      subject: template.subject,
      html: template.html,
    });
  }

  /**
   * Send email when owner invites tenant
   */
  async sendTenantInvitedByOwner(dto: SendTenantInvitedByOwnerEmailDto): Promise<{ id: string }> {
    const language = this.normalizeLanguage(dto.language);
    const template = templates.tenantInvitedByOwnerTemplates[language]({
      tenantName: dto.tenantName,
      ownerName: dto.ownerName,
      buildingName: dto.buildingName,
      apartmentNumber: dto.apartmentNumber,
      invitationLink: dto.invitationLink,
    });

    return this.send({
      to: dto.to,
      subject: template.subject,
      html: template.html,
    });
  }

  /**
   * Send invoice generated email
   */
  async sendInvoiceGenerated(dto: SendInvoiceGeneratedEmailDto): Promise<{ id: string }> {
    const language = this.normalizeLanguage(dto.language);
    const template = templates.invoiceGeneratedTemplates[language]({
      tenantName: dto.tenantName,
      apartmentNumber: dto.apartmentNumber,
      buildingName: dto.buildingName,
      invoiceNumber: dto.invoiceNumber,
      amount: dto.amount,
      dueDate: dto.dueDate,
      invoiceLink: dto.invoiceLink,
    });

    return this.send({
      to: dto.to,
      subject: template.subject,
      html: template.html,
    });
  }

  /**
   * Send meter reading reminder email
   */
  async sendMeterReadingReminder(dto: SendMeterReadingReminderEmailDto): Promise<{ id: string }> {
    const language = this.normalizeLanguage(dto.language);
    const template = templates.meterReadingReminderTemplates[language]({
      tenantName: dto.tenantName,
      apartmentNumber: dto.apartmentNumber,
      buildingName: dto.buildingName,
      meters: dto.meters || [],
      submissionLink: dto.submissionLink,
      deadline: dto.deadline,
    });

    return this.send({
      to: dto.to,
      subject: template.subject,
      html: template.html,
    });
  }

  /**
   * Send generic notification email
   */
  async sendNotification(dto: SendNotificationEmailDto): Promise<{ id: string }> {
    const language = this.normalizeLanguage(dto.language);
    const template = templates.notificationTemplates[language]({
      title: dto.title,
      message: dto.message,
      actionLabel: dto.actionLabel,
      actionLink: dto.actionLink,
      footer: dto.footer,
    });

    return this.send({
      to: dto.to,
      subject: template.subject,
      html: template.html,
    });
  }

  /**
   * Normalize language code to supported language
   */
  private normalizeLanguage(language?: string): EmailLanguage {
    if (!language) return 'lv';

    const code = language.slice(0, 2).toLowerCase();
    if (code === 'ru' || code === 'lv') return code as EmailLanguage;

    return 'lv';
  }
}
