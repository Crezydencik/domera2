import { EmailLanguage } from '../email.types';
export declare class SendEmailDto {
    to: string;
    subject: string;
    html: string;
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
    companyName: string;
    invitationLink: string;
    senderName?: string;
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
    language?: EmailLanguage;
}
export declare class SendMeterReadingReminderEmailDto {
    to: string;
    submissionLink: string;
    tenantName?: string;
    apartmentNumber?: string;
    buildingName?: string;
    meters?: Array<{
        name: string;
        lastReading?: string;
        unit?: string;
    }>;
    deadline?: string;
    language?: EmailLanguage;
}
export declare class SendNotificationEmailDto {
    to: string;
    title: string;
    message: string;
    actionLabel?: string;
    actionLink?: string;
    footer?: string;
    language?: EmailLanguage;
}
