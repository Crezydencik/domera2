import { EmailService } from '../services/email.service';
import { EmailTemplateService } from '../services/email-template.service';
import { SendRegistrationCodeEmailDto, SendPasswordResetEmailDto, SendOwnerInvitationEmailDto, SendTenantInvitationEmailDto, SendTenantInvitedByOwnerEmailDto, SendInvoiceGeneratedEmailDto, SendMeterReadingReminderEmailDto, SendNotificationEmailDto } from '../dto/send-email.dto';
import { EmailLanguage } from '../email.types';
type EmailTemplatePreviewType = 'registrationCode' | 'passwordReset' | 'ownerInvitation' | 'tenantInvitation' | 'tenantInvitedByOwner' | 'invoiceGenerated' | 'meterReadingReminder' | 'meterReadingClosingReminder' | 'notification';
export declare class EmailController {
    private readonly emailService;
    private readonly templateService;
    constructor(emailService: EmailService, templateService: EmailTemplateService);
    previewTemplate(type?: EmailTemplatePreviewType, language?: EmailLanguage): {
        type: EmailTemplatePreviewType;
        language: "en" | "ru" | "lv";
        subject: string;
        html: string;
    };
    sendRegistrationCode(dto: SendRegistrationCodeEmailDto): Promise<{
        id: string;
    }>;
    sendPasswordReset(dto: SendPasswordResetEmailDto): Promise<{
        id: string;
    }>;
    sendOwnerInvitation(dto: SendOwnerInvitationEmailDto): Promise<{
        id: string;
    }>;
    sendTenantInvitation(dto: SendTenantInvitationEmailDto): Promise<{
        id: string;
    }>;
    sendTenantInvitedByOwner(dto: SendTenantInvitedByOwnerEmailDto): Promise<{
        id: string;
    }>;
    sendInvoiceGenerated(dto: SendInvoiceGeneratedEmailDto): Promise<{
        id: string;
    }>;
    sendMeterReadingReminder(dto: SendMeterReadingReminderEmailDto): Promise<{
        id: string;
    }>;
    sendNotification(dto: SendNotificationEmailDto): Promise<{
        id: string;
    }>;
    private normalizePreviewType;
    private buildPreviewTemplate;
}
export {};
