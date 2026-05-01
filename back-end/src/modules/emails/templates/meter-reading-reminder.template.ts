import { EmailTemplate, EmailLanguage } from '../email.types';

const baseStyles = {
  container: 'font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;',
  heading: 'margin:0 0 12px;font-size:24px;font-weight:700;',
  paragraph: 'margin:0 0 12px;line-height:1.6;',
  button:
    'display:inline-block;padding:12px 24px;background:#4f46e5;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;',
  infoBox: 'background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:12px;margin:12px 0;',
  footer: 'margin:20px 0 0;padding:16px 0;border-top:1px solid #e2e8f0;color:#64748b;font-size:13px;line-height:1.5;',
};

export interface MeterReadingReminderParams {
  tenantName?: string;
  apartmentNumber?: string;
  buildingName?: string;
  meters: Array<{ name: string; lastReading?: string; unit?: string }>;
  submissionLink: string;
  deadline?: string;
}

export const meterReadingReminderTemplates: Record<
  EmailLanguage,
  (params: MeterReadingReminderParams) => EmailTemplate
> = {
  en: (params: MeterReadingReminderParams) => ({
    subject: 'Time to submit your meter readings - Domera',
    html: `
      <div style="${baseStyles.container}">
        <h2 style="${baseStyles.heading}">Submit your meter readings</h2>
        <p style="${baseStyles.paragraph}">
          Hello${params.tenantName ? ` ${params.tenantName}` : ''},
        </p>
        <p style="${baseStyles.paragraph}">
          It's time to submit meter readings for your ${params.apartmentNumber ? `apartment ${params.apartmentNumber}` : 'unit'}${params.buildingName ? ` in ${params.buildingName}` : ''}.
        </p>
        <div style="${baseStyles.infoBox}">
          <strong>Meters to read:</strong>
          <ul style="margin:8px 0 0;padding-left:20px;">
            ${params.meters.map((m) => `<li>${m.name}${m.unit ? ` (${m.unit})` : ''}${m.lastReading ? ` - Last: ${m.lastReading}` : ''}</li>`).join('')}
          </ul>
        </div>
        <p style="${baseStyles.paragraph}">
          <a href="${params.submissionLink}" style="${baseStyles.button}">Submit Readings</a>
        </p>
        ${params.deadline ? `<p style="color:#dc2626;">Please submit by: ${params.deadline}</p>` : ''}
        <div style="${baseStyles.footer}">
          <p>Accurate meter readings help us calculate fair bills for all residents.</p>
        </div>
      </div>
    `,
  }),

  ru: (params: MeterReadingReminderParams) => ({
    subject: 'Время отправить показания счетчиков - Domera',
    html: `
      <div style="${baseStyles.container}">
        <h2 style="${baseStyles.heading}">Отправьте показания счетчиков</h2>
        <p style="${baseStyles.paragraph}">
          Здравствуйте${params.tenantName ? `, ${params.tenantName}` : ''},
        </p>
        <p style="${baseStyles.paragraph}">
          Пришло время отправить показания счетчиков для вашей ${params.apartmentNumber ? `квартиры ${params.apartmentNumber}` : 'единицы'}${params.buildingName ? ` в ${params.buildingName}` : ''}.
        </p>
        <div style="${baseStyles.infoBox}">
          <strong>Счетчики для чтения:</strong>
          <ul style="margin:8px 0 0;padding-left:20px;">
            ${params.meters.map((m) => `<li>${m.name}${m.unit ? ` (${m.unit})` : ''}${m.lastReading ? ` - Последнее: ${m.lastReading}` : ''}</li>`).join('')}
          </ul>
        </div>
        <p style="${baseStyles.paragraph}">
          <a href="${params.submissionLink}" style="${baseStyles.button}">Отправить показания</a>
        </p>
        ${params.deadline ? `<p style="color:#dc2626;">Пожалуйста, отправьте до: ${params.deadline}</p>` : ''}
        <div style="${baseStyles.footer}">
          <p>Точные показания счетчиков помогают нам рассчитать справедливые счета для всех жильцов.</p>
        </div>
      </div>
    `,
  }),

  lv: (params: MeterReadingReminderParams) => ({
    subject: 'Laiks iesniegt skaitītāja rādījumus - Domera',
    html: `
      <div style="${baseStyles.container}">
        <h2 style="${baseStyles.heading}">Iesniedziet skaitītāja rādījumus</h2>
        <p style="${baseStyles.paragraph}">
          Sveiki${params.tenantName ? `, ${params.tenantName}` : ''},
        </p>
        <p style="${baseStyles.paragraph}">
          Pienācis laiks iesniegt skaitītāja rādījumus jūsu ${params.apartmentNumber ? `dzīvoklim ${params.apartmentNumber}` : 'vienībai'}${params.buildingName ? ` ${params.buildingName}` : ''}.
        </p>
        <div style="${baseStyles.infoBox}">
          <strong>Skaitītāji, kas jāpanāk:</strong>
          <ul style="margin:8px 0 0;padding-left:20px;">
            ${params.meters.map((m) => `<li>${m.name}${m.unit ? ` (${m.unit})` : ''}${m.lastReading ? ` - Pēdējais: ${m.lastReading}` : ''}</li>`).join('')}
          </ul>
        </div>
        <p style="${baseStyles.paragraph}">
          <a href="${params.submissionLink}" style="${baseStyles.button}">Iesniegt rādījumus</a>
        </p>
        ${params.deadline ? `<p style="color:#dc2626;">Lūdzu, iesniedziet līdz: ${params.deadline}</p>` : ''}
        <div style="${baseStyles.footer}">
          <p>Precīzi skaitītāja rādījumi palīdz mums aprēķināt taisnīgus rēķinus visiem iedzīvotājiem.</p>
        </div>
      </div>
    `,
  }),
};
