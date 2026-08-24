import { Injectable } from '@nestjs/common';
import { EmailLanguage, EmailTemplate } from '../email.types';
import {
  SendInvoiceGeneratedEmailDto,
  SendMeterReadingReminderEmailDto,
  SendNotificationEmailDto,
  SendOwnerInvitationEmailDto,
  SendPasswordResetEmailDto,
  SendRegistrationCodeEmailDto,
  SendTenantInvitationEmailDto,
  SendTenantInvitedByOwnerEmailDto,
} from '../dto/send-email.dto';
import * as templates from '../templates';

@Injectable()
export class EmailTemplateService {
  registrationCode(dto: SendRegistrationCodeEmailDto): EmailTemplate {
    const language = this.normalizeLanguage(dto.language);
    return templates.registrationCodeTemplates[language](dto.code);
  }

  passwordReset(dto: SendPasswordResetEmailDto): EmailTemplate {
    const language = this.normalizeLanguage(dto.language);
    return templates.passwordResetTemplates[language](dto.resetLink);
  }

  ownerInvitation(dto: SendOwnerInvitationEmailDto): EmailTemplate {
    const language = this.normalizeLanguage(dto.language);
    return templates.ownerInvitationTemplates[language]({
      companyName: dto.companyName,
      brandName: dto.companyName,
      ownerName: dto.ownerName,
      ownerEmail: dto.ownerEmail || dto.to,
      invitationLink: dto.invitationLink,
      buildingName: dto.buildingName,
      apartmentNumber: dto.apartmentNumber,
    });
  }

  tenantInvitation(dto: SendTenantInvitationEmailDto): EmailTemplate {
    const language = this.normalizeLanguage(dto.language);
    return templates.tenantInvitationTemplates[language]({
      companyName: dto.companyName,
      brandName: dto.companyName,
      buildingName: dto.buildingName,
      apartmentNumber: dto.apartmentNumber,
      invitationLink: dto.invitationLink,
      senderName: dto.senderName,
    });
  }

  tenantInvitedByOwner(dto: SendTenantInvitedByOwnerEmailDto): EmailTemplate {
    const language = this.normalizeLanguage(dto.language);
    return templates.tenantInvitedByOwnerTemplates[language]({
      tenantName: dto.tenantName,
      brandName: dto.brandName,
      ownerName: dto.ownerName,
      buildingName: dto.buildingName,
      apartmentNumber: dto.apartmentNumber,
      invitationLink: dto.invitationLink,
    });
  }

  invoiceGenerated(dto: SendInvoiceGeneratedEmailDto): EmailTemplate {
    const language = this.normalizeLanguage(dto.language);
    return templates.invoiceGeneratedTemplates[language]({
      tenantName: dto.tenantName,
      brandName: dto.brandName,
      apartmentNumber: dto.apartmentNumber,
      buildingName: dto.buildingName,
      invoiceNumber: dto.invoiceNumber,
      amount: dto.amount,
      dueDate: dto.dueDate,
      invoiceLink: dto.invoiceLink,
    });
  }

  meterReadingReminder(dto: SendMeterReadingReminderEmailDto): EmailTemplate {
    const language = this.normalizeLanguage(dto.language);
    return templates.meterReadingReminderTemplates[language]({
      tenantName: dto.tenantName,
      brandName: dto.brandName,
      apartmentNumber: dto.apartmentNumber,
      buildingName: dto.buildingName,
      meters: dto.meters || [],
      submissionLink: dto.submissionLink,
      periodLabel: dto.periodLabel,
      deadline: dto.deadline,
      reminderStage: dto.reminderStage,
      daysUntilDeadline: dto.daysUntilDeadline,
    });
  }

  notification(dto: SendNotificationEmailDto): EmailTemplate {
    const language = this.normalizeLanguage(dto.language);
    return templates.notificationTemplates[language]({
      title: dto.title,
      message: dto.message,
      actionLabel: dto.actionLabel,
      actionLink: dto.actionLink,
      brandName: dto.brandName,
      footer: dto.footer,
    });
  }

  private normalizeLanguage(language?: string): EmailLanguage {
    if (!language) return 'lv';

    const code = language.slice(0, 2).toLowerCase();
    if (code === 'en' || code === 'ru' || code === 'lv') return code as EmailLanguage;

    return 'lv';
  }
}
