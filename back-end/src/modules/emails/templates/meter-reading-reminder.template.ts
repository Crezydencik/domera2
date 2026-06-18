import { EmailTemplate, EmailLanguage } from '../email.types';
import { alertBox, bulletList, button, infoBox, note, paragraph, renderEmailLayout } from './email-layout.template';

export interface MeterReadingReminderParams {
  tenantName?: string;
  apartmentNumber?: string;
  buildingName?: string;
  meters: Array<{ name: string; lastReading?: string; unit?: string }>;
  submissionLink: string;
  deadline?: string;
}

function meterItems(params: MeterReadingReminderParams, lastLabel: string): string[] {
  return params.meters.map((meter) => (
    `${meter.name}${meter.unit ? ` (${meter.unit})` : ''}${meter.lastReading ? ` - ${lastLabel}: ${meter.lastReading}` : ''}`
  ));
}

export const meterReadingReminderTemplates: Record<
  EmailLanguage,
  (params: MeterReadingReminderParams) => EmailTemplate
> = {
  en: (params: MeterReadingReminderParams) => ({
    subject: 'Time to submit your meter readings - Domera',
    html: renderEmailLayout({
      language: 'en',
      title: 'Submit meter readings',
      badge: params.buildingName || 'Meter readings',
      children: `
        ${paragraph(`Hello${params.tenantName ? `, <strong>${params.tenantName}</strong>` : ''}. It is time to submit meter readings${params.apartmentNumber ? ` for apartment ${params.apartmentNumber}` : ''}.`)}
        ${infoBox('Meters to read:', bulletList(meterItems(params, 'Last')))}
        ${params.deadline ? alertBox(`Please submit by: <strong>${params.deadline}</strong>`) : ''}
        ${button('Submit readings', params.submissionLink)}
        ${note('Accurate meter readings help calculate fair bills for all residents.')}
      `,
    }),
  }),

  ru: (params: MeterReadingReminderParams) => ({
    subject: 'Время отправить показания счетчиков - Domera',
    html: renderEmailLayout({
      language: 'ru',
      title: 'Отправьте показания счётчиков',
      badge: params.buildingName || 'Показания',
      children: `
        ${paragraph(`Здравствуйте${params.tenantName ? `, <strong>${params.tenantName}</strong>` : ''}. Пришло время отправить показания${params.apartmentNumber ? ` для квартиры ${params.apartmentNumber}` : ''}.`)}
        ${infoBox('Счётчики:', bulletList(meterItems(params, 'Последнее')))}
        ${params.deadline ? alertBox(`Пожалуйста, отправьте до: <strong>${params.deadline}</strong>`) : ''}
        ${button('Отправить показания', params.submissionLink)}
        ${note('Точные показания помогают рассчитать справедливые счета для всех жильцов.')}
      `,
    }),
  }),

  lv: (params: MeterReadingReminderParams) => ({
    subject: 'Laiks iesniegt skaitītāja rādījumus - Domera',
    html: renderEmailLayout({
      language: 'lv',
      title: 'Iesniedziet skaitītāju rādījumus',
      badge: params.buildingName || 'Rādījumi',
      children: `
        ${paragraph(`Sveiki${params.tenantName ? `, <strong>${params.tenantName}</strong>` : ''}. Pienācis laiks iesniegt rādījumus${params.apartmentNumber ? ` dzīvoklim ${params.apartmentNumber}` : ''}.`)}
        ${infoBox('Skaitītāji:', bulletList(meterItems(params, 'Pēdējais')))}
        ${params.deadline ? alertBox(`Lūdzu, iesniedziet līdz: <strong>${params.deadline}</strong>`) : ''}
        ${button('Iesniegt rādījumus', params.submissionLink)}
        ${note('Precīzi skaitītāju rādījumi palīdz aprēķināt taisnīgus rēķinus visiem iedzīvotājiem.')}
      `,
    }),
  }),
};
