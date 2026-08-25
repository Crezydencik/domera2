import { RequestUser } from '../../../common/auth/request-user.type';
import { EmailLogService, EmailLogType } from '../services/email-log.service';
import { EmailService } from '../services/email.service';
import { EmailTemplateService } from '../services/email-template.service';
import { SendRegistrationCodeEmailDto, SendPasswordResetEmailDto, SendOwnerInvitationEmailDto, SendTenantInvitationEmailDto, SendTenantInvitedByOwnerEmailDto, SendInvoiceGeneratedEmailDto, SendMeterReadingReminderEmailDto, SendNotificationEmailDto } from '../dto/send-email.dto';
import { EmailLanguage } from '../email.types';
type EmailTemplatePreviewType = 'registrationCode' | 'passwordReset' | 'ownerInvitation' | 'tenantInvitation' | 'tenantInvitedByOwner' | 'invoiceGenerated' | 'meterReadingReminder' | 'meterReadingClosingReminder' | 'notification';
export declare class EmailController {
    private readonly emailService;
    private readonly emailLogService;
    private readonly templateService;
    constructor(emailService: EmailService, emailLogService: EmailLogService, templateService: EmailTemplateService);
    previewTemplate(type?: EmailTemplatePreviewType, language?: EmailLanguage): {
        type: EmailTemplatePreviewType;
        language: "en" | "ru" | "lv";
        subject: string;
        html: string;
    };
    stats(user: RequestUser, type?: EmailLogType, companyId?: string, buildingId?: string, apartmentId?: string): Promise<{
        total: number;
        success: number;
        error: number;
        last30Days: {
            total: number;
            success: number;
            error: number;
        };
        byType: Record<string, {
            total: number;
            success: number;
            error: number;
        }>;
        lastSentAt: string | null;
    }>;
    deliveries(user: RequestUser, type?: EmailLogType, companyId?: string, buildingId?: string, apartmentId?: string, deliveryKeyPrefix?: string, limit?: string): Promise<import("../services/email-log.service").EmailDeliveryLogItem[]>;
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
    private normalizeStatsType;
    private cleanString;
    private cleanNumber;
    private buildPreviewTemplate;
}
export {};
