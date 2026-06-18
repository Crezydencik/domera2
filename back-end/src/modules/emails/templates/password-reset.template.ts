import { EmailTemplate, EmailLanguage } from '../email.types';
import { button, note, paragraph, renderEmailLayout } from './email-layout.template';

export const passwordResetTemplates: Record<EmailLanguage, (resetLink: string) => EmailTemplate> = {
  en: (resetLink: string) => ({
    subject: 'Domera password reset',
    html: renderEmailLayout({
      language: 'en',
      title: 'Reset your password',
      badge: 'Security',
      children: `
        ${paragraph('Click the button below to create a new password.')}
        ${button('Reset password', resetLink)}
        ${note('This link is valid for 24 hours. If you did not request a password reset, you can safely ignore this email.')}
      `,
    }),
  }),

  ru: (resetLink: string) => ({
    subject: 'Сброс пароля Domera',
    html: renderEmailLayout({
      language: 'ru',
      title: 'Сброс пароля',
      badge: 'Безопасность',
      children: `
        ${paragraph('Нажмите кнопку ниже, чтобы создать новый пароль.')}
        ${button('Сбросить пароль', resetLink)}
        ${note('Ссылка действительна в течение 24 часов. Если вы не запрашивали сброс пароля, письмо можно просто проигнорировать.')}
      `,
    }),
  }),

  lv: (resetLink: string) => ({
    subject: 'Domera paroles atiestatīšana',
    html: renderEmailLayout({
      language: 'lv',
      title: 'Atiestatīt paroli',
      badge: 'Drošība',
      children: `
        ${paragraph('Nospiediet pogu zemāk, lai izveidotu jaunu paroli.')}
        ${button('Atiestatīt paroli', resetLink)}
        ${note('Saite ir derīga 24 stundas. Ja neesat pieprasījis paroles atiestatīšanu, varat droši ignorēt šo e-pastu.')}
      `,
    }),
  }),
};
