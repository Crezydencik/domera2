import { EmailTemplate, EmailLanguage } from '../email.types';
export interface NotificationParams {
    title: string;
    message: string;
    actionLabel?: string;
    actionLink?: string;
    footer?: string;
}
export declare const notificationTemplates: Record<EmailLanguage, (params: NotificationParams) => EmailTemplate>;
