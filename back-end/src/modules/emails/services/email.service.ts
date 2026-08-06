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
import { EmailTemplateService } from './email-template.service';
import { EmailTransportService } from './email-transport.service';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly transportService: EmailTransportService,
    private readonly templateService: EmailTemplateService,
  ) {}

  send(payload: SendEmailDto): Promise<{ id: string }> {
    return this.transportService.send(payload);
  }

  async sendRegistrationCode(dto: SendRegistrationCodeEmailDto): Promise<{ id: string }> {
    const template = this.templateService.registrationCode(dto);
    return this.send({ to: dto.to, subject: template.subject, html: template.html });
  }

  async sendPasswordReset(dto: SendPasswordResetEmailDto): Promise<{ id: string }> {
    const template = this.templateService.passwordReset(dto);
    return this.send({ to: dto.to, subject: template.subject, html: template.html });
  }

  async sendOwnerInvitation(dto: SendOwnerInvitationEmailDto): Promise<{ id: string }> {
    const template = this.templateService.ownerInvitation(dto);
    this.logger.log(`Sending owner invitation to ${dto.to}`);
    return this.send({ to: dto.to, subject: template.subject, html: template.html });
  }

  async sendTenantInvitation(dto: SendTenantInvitationEmailDto): Promise<{ id: string }> {
    const template = this.templateService.tenantInvitation(dto);
    return this.send({ to: dto.to, subject: template.subject, html: template.html });
  }

  async sendTenantInvitedByOwner(dto: SendTenantInvitedByOwnerEmailDto): Promise<{ id: string }> {
    const template = this.templateService.tenantInvitedByOwner(dto);
    return this.send({ to: dto.to, subject: template.subject, html: template.html });
  }

  async sendInvoiceGenerated(dto: SendInvoiceGeneratedEmailDto): Promise<{ id: string }> {
    const template = this.templateService.invoiceGenerated(dto);
    return this.send({
      to: dto.to,
      subject: template.subject,
      html: template.html,
      attachments: dto.attachments,
    });
  }

  async sendMeterReadingReminder(dto: SendMeterReadingReminderEmailDto): Promise<{ id: string }> {
    const template = this.templateService.meterReadingReminder(dto);
    return this.send({ to: dto.to, subject: template.subject, html: template.html });
  }

  async sendNotification(dto: SendNotificationEmailDto): Promise<{ id: string }> {
    const template = this.templateService.notification(dto);
    return this.send({ to: dto.to, subject: template.subject, html: template.html });
  }
}
