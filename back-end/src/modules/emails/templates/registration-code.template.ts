import { EmailTemplate, EmailLanguage } from '../email.types';
import { codeBox, note, paragraph, renderEmailLayout } from './email-layout.template';

export const registrationCodeTemplates: Record<EmailLanguage, (code: string) => EmailTemplate> = {
  en: (code: string) => ({
    subject: 'Domera registration verification code',
    html: renderEmailLayout({
      language: 'en',
      title: 'Confirm your registration',
      badge: 'Registration',
      children: `
        ${paragraph('Enter this code on the registration page:')}
        ${codeBox(code)}
        ${note('This code is valid for 1 hour. If you did not request this code, you can safely ignore this email.')}
      `,
    }),
  }),

  ru: (code: string) => ({
    subject: 'Код подтверждения регистрации Domera',
    html: renderEmailLayout({
      language: 'ru',
      title: 'Подтверждение регистрации',
      badge: 'Регистрация',
      children: `
        ${paragraph('Введите этот код на странице регистрации:')}
        ${codeBox(code)}
        ${note('Код действителен в течение 1 часа. Если вы не запрашивали этот код, письмо можно просто проигнорировать.')}
      `,
    }),
  }),

  lv: (code: string) => ({
    subject: 'Domera reģistrācijas apstiprināšanas kods',
    html: renderEmailLayout({
      language: 'lv',
      title: 'Reģistrācijas apstiprināšana',
      badge: 'Reģistrācija',
      children: `
        ${paragraph('Ievadiet šo kodu reģistrācijas lapā:')}
        ${codeBox(code)}
        ${note('Kods ir derīgs 1 stundu. Ja neesat pieprasījis šo kodu, varat droši ignorēt šo e-pastu.')}
      `,
    }),
  }),
};
