import { Injectable, Logger } from '@nestjs/common';
import {
  SendEmailDto,
  SendInvoiceGeneratedEmailDto,
  SendMeterReadingReminderEmailDto,
  SendNotificationEmailDto,
  SendOwnerInvitationEmailDto,
  SendPasswordResetEmailDto,
  SendRegistrationCodeEmailDto,
  SendTenantInvitationEmailDto,
  SendTenantInvitedByOwnerEmailDto,
} from '../dto/send-email.dto';
import { EmailLogService, EmailLogType } from './email-log.service';
import { EmailTemplateService } from './email-template.service';
import { EmailTransportService } from './email-transport.service';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly transportService: EmailTransportService,
    private readonly templateService: EmailTemplateService,
    private readonly emailLogService: EmailLogService,
  ) {}

  send(payload: SendEmailDto): Promise<{ id: string }> {
    return this.transportService.send(payload);
  }

  private async sendTracked(
    type: EmailLogType,
    payload: SendEmailDto,
    context: {
      companyId?: string;
      buildingId?: string;
      apartmentId?: string;
      deliveryKey?: string;
      metadata?: Record<string, unknown>;
    } = {},
  ): Promise<{ id: string }> {
    try {
      const result = await this.send(payload);
      await this.emailLogService.record({
        type,
        status: 'success',
        to: payload.to,
        subject: payload.subject,
        providerMessageId: result.id,
        ...context,
      });
      return result;
    } catch (error) {
      await this.emailLogService.record({
        type,
        status: 'error',
        to: payload.to,
        subject: payload.subject,
        errorMessage: error instanceof Error ? error.message : String(error),
        ...context,
      });
      throw error;
    }
  }

  async sendRegistrationCode(dto: SendRegistrationCodeEmailDto): Promise<{ id: string }> {
    const template = this.templateService.registrationCode(dto);
    return this.sendTracked('registrationCode', { to: dto.to, subject: template.subject, html: template.html });
  }

  async sendPasswordReset(dto: SendPasswordResetEmailDto): Promise<{ id: string }> {
    const template = this.templateService.passwordReset(dto);
    return this.sendTracked('passwordReset', { to: dto.to, subject: template.subject, html: template.html });
  }

  async sendOwnerInvitation(dto: SendOwnerInvitationEmailDto): Promise<{ id: string }> {
    const template = this.templateService.ownerInvitation(dto);
    this.logger.log(`Sending owner invitation to ${dto.to}`);
    return this.sendTracked('ownerInvitation', { to: dto.to, subject: template.subject, html: template.html });
  }

  async sendTenantInvitation(dto: SendTenantInvitationEmailDto): Promise<{ id: string }> {
    const template = this.templateService.tenantInvitation(dto);
    return this.sendTracked('tenantInvitation', { to: dto.to, subject: template.subject, html: template.html });
  }

  async sendTenantInvitedByOwner(dto: SendTenantInvitedByOwnerEmailDto): Promise<{ id: string }> {
    const template = this.templateService.tenantInvitedByOwner(dto);
    return this.sendTracked('tenantInvitedByOwner', { to: dto.to, subject: template.subject, html: template.html });
  }

  async sendInvoiceGenerated(dto: SendInvoiceGeneratedEmailDto): Promise<{ id: string }> {
    const template = this.templateService.invoiceGenerated(dto);
    return this.sendTracked(
      'invoiceGenerated',
      {
        to: dto.to,
        subject: template.subject,
        html: template.html,
        attachments: dto.attachments,
      },
      {
        companyId: dto.companyId,
        buildingId: dto.buildingId,
        apartmentId: dto.apartmentId,
        metadata: { invoiceNumber: dto.invoiceNumber },
      },
    );
  }

  async sendMeterReadingReminder(dto: SendMeterReadingReminderEmailDto): Promise<{ id: string }> {
    const template = this.templateService.meterReadingReminder(dto);
    return this.sendTracked(
      'meterReadingReminder',
      { to: dto.to, subject: template.subject, html: template.html },
      {
        companyId: dto.companyId,
        buildingId: dto.buildingId,
        apartmentId: dto.apartmentId,
        deliveryKey: dto.deliveryKey,
        metadata: { reminderStage: dto.reminderStage, deadline: dto.deadline },
      },
    );
  }

  async sendNotification(dto: SendNotificationEmailDto): Promise<{ id: string }> {
    const template = this.templateService.notification(dto);
    return this.sendTracked(
      'notification',
      { to: dto.to, subject: template.subject, html: template.html },
      {
        companyId: dto.companyId,
        buildingId: dto.buildingId,
        apartmentId: dto.apartmentId,
        deliveryKey: dto.deliveryKey,
      },
    );
  }
}
