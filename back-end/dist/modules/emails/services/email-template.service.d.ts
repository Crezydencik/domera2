import { EmailTemplate } from '../email.types';
import { SendInvoiceGeneratedEmailDto, SendMeterReadingReminderEmailDto, SendNotificationEmailDto, SendOwnerInvitationEmailDto, SendPasswordResetEmailDto, SendRegistrationCodeEmailDto, SendTenantInvitationEmailDto, SendTenantInvitedByOwnerEmailDto } from '../dto/send-email.dto';
export declare class EmailTemplateService {
    registrationCode(dto: SendRegistrationCodeEmailDto): EmailTemplate;
    passwordReset(dto: SendPasswordResetEmailDto): EmailTemplate;
    ownerInvitation(dto: SendOwnerInvitationEmailDto): EmailTemplate;
    tenantInvitation(dto: SendTenantInvitationEmailDto): EmailTemplate;
    tenantInvitedByOwner(dto: SendTenantInvitedByOwnerEmailDto): EmailTemplate;
    invoiceGenerated(dto: SendInvoiceGeneratedEmailDto): EmailTemplate;
    meterReadingReminder(dto: SendMeterReadingReminderEmailDto): EmailTemplate;
    notification(dto: SendNotificationEmailDto): EmailTemplate;
    private normalizeLanguage;
}
