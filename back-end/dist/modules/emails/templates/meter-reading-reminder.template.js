"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.meterReadingReminderTemplates = void 0;
const email_layout_template_1 = require("./email-layout.template");
function periodValue(params, untilLabel) {
    return params.periodLabel || (params.deadline ? `${untilLabel} ${params.deadline}` : undefined);
}
function closingSummaryBox(params, countdownLabel, periodLabel, untilLabel) {
    if (!countdownLabel)
        return (0, email_layout_template_1.detailRows)([{ label: periodLabel, value: periodValue(params, untilLabel) }]);
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
function copyFor(language, params) {
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
            subject: 'Время отправить показания счетчиков - Domera',
            title: 'Отправьте показания счётчиков',
            badge: params.buildingName || 'Показания',
            body: `Здравствуйте${params.tenantName ? `, <strong>${params.tenantName}</strong>` : ''}. Пришло время отправить показания${apartment ? ` для квартиры ${apartment}` : ''}.`,
            countdownLabel: '',
            alert: params.deadline ? `Пожалуйста, отправьте до: <strong>${params.deadline}</strong>` : '',
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
            subject: 'Laiks iesniegt skaitītāja rādījumus - Domera',
            title: 'Iesniedziet skaitītāju rādījumus',
            badge: params.buildingName || 'Rādījumi',
            body: `Sveiki${params.tenantName ? `, <strong>${params.tenantName}</strong>` : ''}. Pienācis laiks iesniegt rādījumus${apartment ? ` dzīvoklim ${apartment}` : ''}.`,
            countdownLabel: '',
            alert: params.deadline ? `Lūdzu, iesniedziet līdz: <strong>${params.deadline}</strong>` : '',
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
        countdownLabel: '',
        alert: params.deadline ? `Please submit by: <strong>${params.deadline}</strong>` : '',
        button: 'Submit readings',
        note: 'Accurate meter readings help calculate fair bills for all residents.',
    };
}
exports.meterReadingReminderTemplates = {
    en: (params) => {
        const copy = copyFor('en', params);
        return {
            subject: copy.subject,
            html: (0, email_layout_template_1.renderEmailLayout)({
                language: 'en',
                brandName: params.brandName,
                title: copy.title,
                badge: copy.badge,
                children: `
        ${(0, email_layout_template_1.paragraph)(copy.body)}
        ${closingSummaryBox(params, copy.countdownLabel, 'Submission period', 'Until')}
        ${copy.alert ? (0, email_layout_template_1.alertBox)(copy.alert) : ''}
        ${(0, email_layout_template_1.button)(copy.button, params.submissionLink)}
        ${(0, email_layout_template_1.note)(copy.note)}
      `,
            }),
        };
    },
    ru: (params) => {
        const copy = copyFor('ru', params);
        return {
            subject: copy.subject,
            html: (0, email_layout_template_1.renderEmailLayout)({
                language: 'ru',
                brandName: params.brandName,
                title: copy.title,
                badge: copy.badge,
                children: `
        ${(0, email_layout_template_1.paragraph)(copy.body)}
        ${closingSummaryBox(params, copy.countdownLabel, 'Период сдачи', 'до')}
        ${copy.alert ? (0, email_layout_template_1.alertBox)(copy.alert) : ''}
        ${(0, email_layout_template_1.button)(copy.button, params.submissionLink)}
        ${(0, email_layout_template_1.note)(copy.note)}
      `,
            }),
        };
    },
    lv: (params) => {
        const copy = copyFor('lv', params);
        return {
            subject: copy.subject,
            html: (0, email_layout_template_1.renderEmailLayout)({
                language: 'lv',
                brandName: params.brandName,
                title: copy.title,
                badge: copy.badge,
                children: `
        ${(0, email_layout_template_1.paragraph)(copy.body)}
        ${closingSummaryBox(params, copy.countdownLabel, 'Iesniegšanas periods', 'līdz')}
        ${copy.alert ? (0, email_layout_template_1.alertBox)(copy.alert) : ''}
        ${(0, email_layout_template_1.button)(copy.button, params.submissionLink)}
        ${(0, email_layout_template_1.note)(copy.note)}
      `,
            }),
        };
    },
};
