import { EmailTemplate, EmailLanguage } from '../email.types';
export interface NotificationParams {
    title: string;
    message: string;
    messageHtml?: string;
    actionLabel?: string;
    actionLink?: string;
    brandName?: string;
    footer?: string;
    accentColor?: string;
    logoDataUrl?: string;
    badge?: string;
}
export declare const notificationTemplates: Record<EmailLanguage, (params: NotificationParams) => EmailTemplate>;
