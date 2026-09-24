export type EmailLanguage = 'en' | 'ru' | 'lv';
export interface EmailTemplate {
    subject: string;
    html: string;
}
export interface EmailPayload {
    to: string;
    subject: string;
    html: string;
}
export declare enum EmailType {
    REGISTRATION_CODE = "registration-code",
    PASSWORD_RESET = "password-reset",
    OWNER_INVITATION = "owner-invitation",
    TENANT_INVITATION = "tenant-invitation",
    TENANT_INVITED_BY_OWNER = "tenant-invited-by-owner",
    INVOICE_GENERATED = "invoice-generated",
    METER_READING_REMINDER = "meter-reading-reminder",
    NOTIFICATION = "notification"
}
