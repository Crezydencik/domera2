import { SendEmailDto, SendInvoiceGeneratedEmailDto, SendMeterReadingReminderEmailDto, SendNotificationEmailDto, SendOwnerInvitationEmailDto, SendPasswordResetEmailDto, SendRegistrationCodeEmailDto, SendTenantInvitationEmailDto, SendTenantInvitedByOwnerEmailDto } from '../dto/send-email.dto';
import { EmailLogService } from './email-log.service';
import { EmailTemplateService } from './email-template.service';
import { EmailTransportService } from './email-transport.service';
export declare class EmailService {
    private readonly transportService;
    private readonly templateService;
    private readonly emailLogService;
    private readonly logger;
    constructor(transportService: EmailTransportService, templateService: EmailTemplateService, emailLogService: EmailLogService);
    send(payload: SendEmailDto): Promise<{
        id: string;
    }>;
    private sendTracked;
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
}
