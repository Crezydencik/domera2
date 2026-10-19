import { SendEmailDto, SendInvoiceGeneratedEmailDto, SendMeterReadingReminderEmailDto, SendNotificationEmailDto, SendInformationMailingDto, SaveInformationMailingTemplateDto, SendOwnerInvitationEmailDto, SendPasswordResetEmailDto, SendRegistrationCodeEmailDto, SendTenantInvitationEmailDto, SendTenantInvitedByOwnerEmailDto } from '../dto/send-email.dto';
import { EmailLogService } from './email-log.service';
import { EmailTemplateService } from './email-template.service';
import { EmailTransportService } from './email-transport.service';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
export declare class EmailService {
    private readonly transportService;
    private readonly templateService;
    private readonly emailLogService;
    private readonly firebaseAdminService;
    private readonly logger;
    constructor(transportService: EmailTransportService, templateService: EmailTemplateService, emailLogService: EmailLogService, firebaseAdminService: FirebaseAdminService);
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
    sendNotification(dto: SendNotificationEmailDto, branding?: {
        accentColor?: string;
        logoDataUrl?: string;
        companyName?: string;
    }): Promise<{
        id: string;
    }>;
    private buildMailingContext;
    sendInformationMailing(companyId: string, dto: SendInformationMailingDto): Promise<{
        sent: number;
        failed: number;
        pending: number;
        status: "sending" | "completed";
        mailingId: string;
        recipients: number;
    }>;
    processInformationMailing(history: FirebaseFirestore.DocumentReference, deadlineMs: number): Promise<{
        sent: number;
        failed: number;
        pending: number;
        status: 'sending' | 'completed';
    }>;
    resumePendingMailings(now?: Date): Promise<{
        resumed: number;
    }>;
    private mailingRecipientDocId;
    getInformationMailingTemplates(companyId: string): Promise<{
        items: {
            id: string;
        }[];
    }>;
    saveInformationMailingTemplate(companyId: string, dto: SaveInformationMailingTemplateDto): Promise<{
        name: string;
        title: string;
        message: string;
        messageHtml: string | undefined;
        createdAt: Date;
        id: string;
    }>;
    getInformationMailingHistory(companyId: string): Promise<{
        items: {
            id: string;
        }[];
    }>;
    deleteInformationMailingTemplate(companyId: string, templateId: string): Promise<{
        id: string;
        deleted: boolean;
    }>;
    private sanitizeMailingHtml;
    private getCompanyDocCached;
    private resolveCompanySenderName;
    private resolveCompanyName;
    private findUsersByEmail;
    private createInformationNotification;
}
