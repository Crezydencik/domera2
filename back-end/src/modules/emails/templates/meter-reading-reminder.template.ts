import { EmailTemplate, EmailLanguage } from '../email.types';
import { alertBox, button, detailRows, note, paragraph, renderEmailLayout } from './email-layout.template';

export interface MeterReadingReminderParams {
  tenantName?: string;
  brandName?: string;
  apartmentNumber?: string;
  buildingName?: string;
  meters?: Array<{ name: string; lastReading?: string; unit?: string }>;
  submissionLink: string;
  periodLabel?: string;
  deadline?: string;
  reminderStage?: 'start' | 'end' | 'close';
  daysUntilDeadline?: number;
}

function periodValue(params: MeterReadingReminderParams, untilLabel: string) {
  return params.periodLabel || (params.deadline ? `${untilLabel} ${params.deadline}` : undefined);
}

function closingSummaryBox(params: MeterReadingReminderParams, countdownLabel: string, periodLabel: string, untilLabel: string) {
  if (!countdownLabel) return detailRows([{ label: periodLabel, value: periodValue(params, untilLabel) }]);
  const days = params.daysUntilDeadline;
  const period = periodValue(params, untilLabel);

  return `
    <div style="margin:0 0 30px;padding:22px 24px;background:#f8fafc;border:1px solid #dbe4f0;border-radius:10px;text-align:center;">
      ${days !== undefined && Number.isFinite(days) ? `
        <div style="font-size:54px;line-height:1;font-weight:900;color:#155DFC;letter-spacing:0;">${Math.max(0, Math.floor(days))}</div>
        <div style="margin:8px 0 18px;font-size:13px;line-height:1.4;font-weight:800;color:#475569;text-transform:uppercase;">${countdownLabel}</div>
      ` : ''}
      ${period ? `
        <div style="border-top:1px solid #dbe4f0;padding-top:16px;">
          <div style="margin:0 0 6px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.4px;">${periodLabel}</div>
          <div style="font-size:18px;font-weight:800;color:#0f172a;">${period}</div>
        </div>
      ` : ''}
    </div>
  `;
}

function copyFor(language: EmailLanguage, params: MeterReadingReminderParams) {
  const stage = params.reminderStage || 'start';
  const apartment = params.apartmentNumber;

  if (language === 'ru') {
    if (stage === 'close') {
      return {
        subject: 'Последний момент сдать показания воды - Domera',
        title: 'Последний момент сдать показания воды',
        badge: params.buildingName || 'Показания',
        body: `Здравствуйте${params.tenantName ? `, <strong>${params.tenantName}</strong>` : ''}. Отправьте показания${apartment ? ` для квартиры ${apartment}` : ''}.`,
        countdownLabel: 'дней до окончания сдачи',
        alert: '',
        button: 'Отправить показания',
        note: 'Если показания уже отправлены, повторно отправлять их не нужно.',
      };
    }
    if (stage === 'end') {
      return {
        subject: 'Скоро заканчивается сдача показаний - Domera',
        title: 'Сдача показаний скоро закончится',
        badge: params.buildingName || 'Показания',
        body: `Здравствуйте${params.tenantName ? `, <strong>${params.tenantName}</strong>` : ''}. Отправьте показания${apartment ? ` для квартиры ${apartment}` : ''}, если ещё не сделали этого.`,
        countdownLabel: 'дней до окончания сдачи',
        alert: '',
        button: 'Отправить показания',
        note: 'Напоминание отправляется только если показания за текущий период ещё не получены.',
      };
    }
    return {
      subject: 'Отправка показаний счётчиков - Domera',
      title: 'Отправка показаний счётчиков',
      badge: params.buildingName || 'Показания',
      body: `Здравствуйте${params.tenantName ? `, <strong>${params.tenantName}</strong>` : ''}. Пришло время отправить показания${apartment ? ` для квартиры ${apartment}` : ''}.`,
      countdownLabel: 'дней до окончания сдачи',
      alert: '',
      button: 'Отправить показания',
      note: 'Точные показания помогают рассчитать справедливые счета для всех жильцов.',
    };
  }

  if (language === 'lv') {
    if (stage === 'close') {
      return {
        subject: 'Pēdējais brīdis iesniegt ūdens rādījumus - Domera',
        title: 'Pēdējais brīdis iesniegt ūdens rādījumus',
        badge: params.buildingName || 'Rādījumi',
        body: `Sveiki${params.tenantName ? `, <strong>${params.tenantName}</strong>` : ''}. Lūdzu, iesniedziet rādījumus${apartment ? ` dzīvoklim ${apartment}` : ''}.`,
        countdownLabel: 'dienas līdz beigām',
        alert: '',
        button: 'Iesniegt rādījumus',
        note: 'Ja rādījumi jau ir iesniegti, atkārtota iesniegšana nav nepieciešama.',
      };
    }
    if (stage === 'end') {
      return {
        subject: 'Skaitītāju rādījumu iesniegšanas periods drīz beigsies - Domera',
        title: 'Rādījumu iesniegšana drīz beigsies',
        badge: params.buildingName || 'Rādījumi',
        body: `Sveiki${params.tenantName ? `, <strong>${params.tenantName}</strong>` : ''}. Lūdzu, iesniedziet rādījumus${apartment ? ` dzīvoklim ${apartment}` : ''}, ja tas vēl nav izdarīts.`,
        countdownLabel: 'dienas līdz beigām',
        alert: '',
        button: 'Iesniegt rādījumus',
        note: 'Atgādinājums tiek nosūtīts tikai tad, ja rādījumi par šo periodu vēl nav saņemti.',
      };
    }
    return {
      subject: 'Skaitītāju rādījumu iesniegšana - Domera',
      title: 'Skaitītāju rādījumu iesniegšana',
      badge: params.buildingName || 'Rādījumi',
      body: `Sveiki${params.tenantName ? `, <strong>${params.tenantName}</strong>` : ''}. Pienācis laiks iesniegt rādījumus${apartment ? ` dzīvoklim ${apartment}` : ''}.`,
      countdownLabel: 'dienas līdz beigām',
      alert: '',
      button: 'Iesniegt rādījumus',
      note: 'Precīzi skaitītāju rādījumi palīdz aprēķināt taisnīgus rēķinus visiem iedzīvotājiem.',
    };
  }

  if (stage === 'close') {
    return {
      subject: 'Last chance to submit water readings - Domera',
      title: 'Last chance to submit water readings',
      badge: params.buildingName || 'Meter readings',
      body: `Hello${params.tenantName ? `, <strong>${params.tenantName}</strong>` : ''}. Please submit meter readings${apartment ? ` for apartment ${apartment}` : ''}.`,
      countdownLabel: 'days until closing',
      alert: '',
      button: 'Submit readings',
      note: 'If readings have already been submitted, no further action is needed.',
    };
  }
  if (stage === 'end') {
    return {
      subject: 'Meter reading submission period is ending - Domera',
      title: 'Submission period is ending',
      badge: params.buildingName || 'Meter readings',
      body: `Hello${params.tenantName ? `, <strong>${params.tenantName}</strong>` : ''}. Please submit readings${apartment ? ` for apartment ${apartment}` : ''} if you have not done so yet.`,
      countdownLabel: 'days until closing',
      alert: '',
      button: 'Submit readings',
      note: 'This reminder is sent only if readings for the current period have not been received yet.',
    };
  }
  return {
    subject: 'Time to submit your meter readings - Domera',
    title: 'Submit meter readings',
    badge: params.buildingName || 'Meter readings',
    body: `Hello${params.tenantName ? `, <strong>${params.tenantName}</strong>` : ''}. It is time to submit meter readings${apartment ? ` for apartment ${apartment}` : ''}.`,
    countdownLabel: 'days until closing',
    alert: '',
    button: 'Submit readings',
    note: 'Accurate meter readings help calculate fair bills for all residents.',
  };
}

export const meterReadingReminderTemplates: Record<
  EmailLanguage,
  (params: MeterReadingReminderParams) => EmailTemplate
> = {
  en: (params: MeterReadingReminderParams) => {
    const copy = copyFor('en', params);
    return {
    subject: copy.subject,
    html: renderEmailLayout({
      language: 'en',
      brandName: params.brandName,
      title: copy.title,
      badge: copy.badge,
      children: `
        ${paragraph(copy.body)}
        ${closingSummaryBox(params, copy.countdownLabel, 'Submission period', 'Until')}
        ${copy.alert ? alertBox(copy.alert) : ''}
        ${button(copy.button, params.submissionLink)}
        ${note(copy.note)}
      `,
    }),
  };
  },

  ru: (params: MeterReadingReminderParams) => {
    const copy = copyFor('ru', params);
    return {
    subject: copy.subject,
    html: renderEmailLayout({
      language: 'ru',
      brandName: params.brandName,
      title: copy.title,
      badge: copy.badge,
      children: `
        ${paragraph(copy.body)}
        ${closingSummaryBox(params, copy.countdownLabel, 'Период сдачи', 'до')}
        ${copy.alert ? alertBox(copy.alert) : ''}
        ${button(copy.button, params.submissionLink)}
        ${note(copy.note)}
      `,
    }),
  };
  },

  lv: (params: MeterReadingReminderParams) => {
    const copy = copyFor('lv', params);
    return {
    subject: copy.subject,
    html: renderEmailLayout({
      language: 'lv',
      brandName: params.brandName,
      title: copy.title,
      badge: copy.badge,
      children: `
        ${paragraph(copy.body)}
        ${closingSummaryBox(params, copy.countdownLabel, 'Iesniegšanas periods', 'līdz')}
        ${copy.alert ? alertBox(copy.alert) : ''}
        ${button(copy.button, params.submissionLink)}
        ${note(copy.note)}
      `,
    }),
  };
  },
};
