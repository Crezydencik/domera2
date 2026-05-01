import { EmailService } from './email.service';
import { SendRegistrationCodeEmailDto, SendPasswordResetEmailDto, SendOwnerInvitationEmailDto, SendTenantInvitationEmailDto, SendTenantInvitedByOwnerEmailDto, SendInvoiceGeneratedEmailDto, SendMeterReadingReminderEmailDto, SendNotificationEmailDto } from './dto/send-email.dto';
export declare class EmailController {
    private readonly emailService;
    constructor(emailService: EmailService);
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
