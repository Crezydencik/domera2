import { ConfigService } from '@nestjs/config';
import { SendRegistrationCodeEmailDto, SendPasswordResetEmailDto, SendOwnerInvitationEmailDto, SendTenantInvitationEmailDto, SendTenantInvitedByOwnerEmailDto, SendInvoiceGeneratedEmailDto, SendMeterReadingReminderEmailDto, SendNotificationEmailDto, SendEmailDto } from './dto/send-email.dto';
export declare class EmailService {
    private readonly configService;
    private resend;
    private readonly from;
    private readonly apiKey;
    constructor(configService: ConfigService);
    send(payload: SendEmailDto): Promise<{
        id: string;
    }>;
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
    private normalizeLanguage;
}
