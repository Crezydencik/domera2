import { EmailTemplate, EmailLanguage } from '../email.types';
import { button, emailStyles, note, renderEmailLayout } from './email-layout.template';

export interface NotificationParams {
  title: string;
  message: string;
  actionLabel?: string;
  actionLink?: string;
  footer?: string;
}

function action(params: NotificationParams): string {
  if (!params.actionLabel || !params.actionLink) return '';
  return button(params.actionLabel, params.actionLink);
}

export const notificationTemplates: Record<
  EmailLanguage,
  (params: NotificationParams) => EmailTemplate
> = {
  en: (params: NotificationParams) => ({
    subject: params.title,
    html: renderEmailLayout({
      language: 'en',
      title: params.title,
      badge: 'Notification',
      children: `
        <div style="${emailStyles.paragraph}">${params.message}</div>
        ${action(params)}
        ${note(params.footer || 'This is an automated notification from Domera.')}
      `,
    }),
  }),

  ru: (params: NotificationParams) => ({
    subject: params.title,
    html: renderEmailLayout({
      language: 'ru',
      title: params.title,
      badge: 'Уведомление',
      children: `
        <div style="${emailStyles.paragraph}">${params.message}</div>
        ${action(params)}
        ${note(params.footer || 'Это автоматическое уведомление от Domera.')}
      `,
    }),
  }),

  lv: (params: NotificationParams) => ({
    subject: params.title,
    html: renderEmailLayout({
      language: 'lv',
      title: params.title,
      badge: 'Paziņojums',
      children: `
        <div style="${emailStyles.paragraph}">${params.message}</div>
        ${action(params)}
        ${note(params.footer || 'Šis ir automātisks paziņojums no Domera.')}
      `,
    }),
  }),
};
