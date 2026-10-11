import { EmailTemplate, EmailLanguage } from '../email.types';
import { button, emailStyles, note, renderEmailLayout } from './email-layout.template';

function escapeHtml(value: string | undefined) {
  return (value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character);
}

function safeUrl(value: string | undefined) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
  } catch {
    return '';
  }
}

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

function action(params: NotificationParams): string {
  const href = safeUrl(params.actionLink);
  if (!params.actionLabel || !href) return '';
  return button(escapeHtml(params.actionLabel), escapeHtml(href));
}

export const notificationTemplates: Record<
  EmailLanguage,
  (params: NotificationParams) => EmailTemplate
> = {
  en: (params: NotificationParams) => ({
    subject: params.title,
    html: renderEmailLayout({
      language: 'en',
      title: escapeHtml(params.title),
      badge: params.badge || 'Notification',
      brandName: params.brandName,
      accentColor: params.accentColor,
      logoDataUrl: params.logoDataUrl,
      children: `
        <div style="${emailStyles.paragraph}">${params.messageHtml || escapeHtml(params.message).replace(/\n/g, '<br />')}</div>
        ${action(params)}
        ${note(escapeHtml(params.footer || 'This is an automated notification from Domera.'))}
      `,
    }),
  }),

  ru: (params: NotificationParams) => ({
    subject: params.title,
    html: renderEmailLayout({
      language: 'ru',
      title: escapeHtml(params.title),
      badge: params.badge || 'Уведомление',
      brandName: params.brandName,
      accentColor: params.accentColor,
      logoDataUrl: params.logoDataUrl,
      children: `
        <div style="${emailStyles.paragraph}">${params.messageHtml || escapeHtml(params.message).replace(/\n/g, '<br />')}</div>
        ${action(params)}
        ${note(escapeHtml(params.footer || 'Это автоматическое уведомление от Domera.'))}
      `,
    }),
  }),

  lv: (params: NotificationParams) => ({
    subject: params.title,
    html: renderEmailLayout({
      language: 'lv',
      title: escapeHtml(params.title),
      badge: params.badge || 'Paziņojums',
      brandName: params.brandName,
      accentColor: params.accentColor,
      logoDataUrl: params.logoDataUrl,
      children: `
        <div style="${emailStyles.paragraph}">${params.messageHtml || escapeHtml(params.message).replace(/\n/g, '<br />')}</div>
        ${action(params)}
        ${note(escapeHtml(params.footer || 'Šis ir automātisks paziņojums no Domera.'))}
      `,
    }),
  }),
};
