import { EmailLanguage } from '../email.types';
export type EmailAttachmentDto = {
    filename: string;
    content: string;
    contentType?: string;
};
export declare class SendEmailDto {
    to: string;
    subject: string;
    html: string;
    attachments?: EmailAttachmentDto[];
}
export declare class SendRegistrationCodeEmailDto {
    to: string;
    code: string;
    language?: EmailLanguage;
}
export declare class SendPasswordResetEmailDto {
    to: string;
    resetLink: string;
    language?: EmailLanguage;
}
export declare class SendOwnerInvitationEmailDto {
    to: string;
    ownerName?: string;
    ownerEmail?: string;
    companyName: string;
    invitationLink: string;
    buildingName?: string;
    apartmentNumber?: string;
    language?: EmailLanguage;
}
export declare class SendTenantInvitationEmailDto {
    to: string;
    companyName: string;
    invitationLink: string;
    buildingName?: string;
    apartmentNumber?: string;
    senderName?: string;
    language?: EmailLanguage;
}
export declare class SendTenantInvitedByOwnerEmailDto {
    to: string;
    ownerName: string;
    invitationLink: string;
    tenantName?: string;
    brandName?: string;
    buildingName?: string;
    apartmentNumber?: string;
    language?: EmailLanguage;
}
export declare class SendInvoiceGeneratedEmailDto {
    to: string;
    invoiceNumber: string;
    amount: string;
    dueDate: string;
    invoiceLink: string;
    tenantName?: string;
    apartmentNumber?: string;
    buildingName?: string;
    brandName?: string;
    language?: EmailLanguage;
    attachments?: EmailAttachmentDto[];
}
export declare class SendMeterReadingReminderEmailDto {
    to: string;
    submissionLink: string;
    tenantName?: string;
    apartmentNumber?: string;
    buildingName?: string;
    brandName?: string;
    meters?: Array<{
        name: string;
        lastReading?: string;
        unit?: string;
    }>;
    periodLabel?: string;
    deadline?: string;
    reminderStage?: 'start' | 'end' | 'close';
    daysUntilDeadline?: number;
    language?: EmailLanguage;
}
export declare class SendNotificationEmailDto {
    to: string;
    title: string;
    message: string;
    actionLabel?: string;
    actionLink?: string;
    brandName?: string;
    footer?: string;
    language?: EmailLanguage;
}
