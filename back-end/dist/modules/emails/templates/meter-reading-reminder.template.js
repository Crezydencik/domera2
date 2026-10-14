"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.meterReadingReminderTemplates = void 0;
const email_layout_template_1 = require("./email-layout.template");
function periodValue(params, untilLabel) {
    return params.periodLabel || (params.deadline ? `${untilLabel} ${params.deadline}` : undefined);
}
function propertyLocation(params, language) {
    const address = params.buildingName?.trim();
    const apartment = params.apartmentNumber?.trim();
    const apartmentLabel = language === 'ru' ? 'Квартира' : language === 'lv' ? 'Dzīvoklis' : 'Apartment';
    return [address, apartment ? `${apartmentLabel} ${apartment}` : undefined].filter(Boolean).join(' · ');
}
function closingSummaryBox(params, countdownLabel, periodLabel, untilLabel) {
    if (!countdownLabel)
        return (0, email_layout_template_1.detailRows)([{ label: periodLabel, value: periodValue(params, untilLabel) }]);
    const days = params.daysUntilDeadline;
    const period = periodValue(params, untilLabel);
    return `
    <div style="margin:0 0 30px;padding:22px 24px;text-align:center;">
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
    const badge = (0, email_layout_template_1.headerIdentity)(params.brandName);
    if (language === 'ru') {
        if (stage === 'close') {
            return {
                subject: `Последний момент сдать показания воды - ${params.brandName || 'Domera'}`,
                title: 'Последний момент сдать показания воды',
                badge: badge || 'Показания',
                body: `Здравствуйте${params.tenantName ? `, <strong>${params.tenantName}</strong>` : ''}. Отправьте показания.`,
                countdownLabel: 'дней до окончания сдачи',
                alert: '',
                button: 'Отправить показания',
                note: 'Если показания уже отправлены, повторно отправлять их не нужно.',
            };
        }
        if (stage === 'end') {
            return {
                subject: `Скоро заканчивается сдача показаний - ${params.brandName || 'Domera'}`,
                title: 'Сдача показаний скоро закончится',
                badge: badge || 'Показания',
                body: `Здравствуйте${params.tenantName ? `, <strong>${params.tenantName}</strong>` : ''}. Отправьте показания, если ещё не сделали этого.`,
                countdownLabel: 'дней до окончания сдачи',
                alert: '',
                button: 'Отправить показания',
                note: 'Напоминание отправляется только если показания за текущий период ещё не получены.',
            };
        }
        return {
            subject: `Отправка показаний счётчиков - ${params.brandName || 'Domera'}`,
            title: 'Отправка показаний счётчиков',
            badge: badge || 'Показания',
            body: `Здравствуйте${params.tenantName ? `, <strong>${params.tenantName}</strong>` : ''}. Пришло время отправить показания.`,
            countdownLabel: 'дней до окончания сдачи',
            alert: '',
            button: 'Отправить показания',
            note: 'Точные показания помогают рассчитать справедливые счета для всех жильцов.',
        };
    }
    if (language === 'lv') {
        if (stage === 'close') {
            return {
                subject: `Pēdējais brīdis iesniegt ūdens rādījumus - ${params.brandName || 'Domera'}`,
                title: 'Pēdējais brīdis iesniegt ūdens rādījumus',
                badge: badge || 'Rādījumi',
                body: `Sveiki${params.tenantName ? `, <strong>${params.tenantName}</strong>` : ''}. Lūdzu, iesniedziet rādījumus.`,
                countdownLabel: 'dienas līdz beigām',
                alert: '',
                button: 'Iesniegt rādījumus',
                note: 'Ja rādījumi jau ir iesniegti, atkārtota iesniegšana nav nepieciešama.',
            };
        }
        if (stage === 'end') {
            return {
                subject: `Skaitītāju rādījumu iesniegšanas periods drīz beigsies - ${params.brandName || 'Domera'}`,
                title: 'Rādījumu iesniegšana drīz beigsies',
                badge: badge || 'Rādījumi',
                body: `Sveiki${params.tenantName ? `, <strong>${params.tenantName}</strong>` : ''}. Lūdzu, iesniedziet rādījumus, ja tas vēl nav izdarīts.`,
                countdownLabel: 'dienas līdz beigām',
                alert: '',
                button: 'Iesniegt rādījumus',
                note: 'Atgādinājums tiek nosūtīts tikai tad, ja rādījumi par šo periodu vēl nav saņemti.',
            };
        }
        return {
            subject: `Skaitītāju rādījumu iesniegšana - ${params.brandName || 'Domera'}`,
            title: 'Skaitītāju rādījumu iesniegšana',
            badge: badge || 'Rādījumi',
            body: `Sveiki${params.tenantName ? `, <strong>${params.tenantName}</strong>` : ''}. Pienācis laiks iesniegt rādījumus.`,
            countdownLabel: 'dienas līdz beigām',
            alert: '',
            button: 'Iesniegt rādījumus',
            note: 'Precīzi skaitītāju rādījumi palīdz aprēķināt taisnīgus rēķinus visiem iedzīvotājiem.',
        };
    }
    if (stage === 'close') {
        return {
            subject: `Last chance to submit water readings - ${params.brandName || 'Domera'}`,
            title: 'Last chance to submit water readings',
            badge: badge || 'Meter readings',
            body: `Hello${params.tenantName ? `, <strong>${params.tenantName}</strong>` : ''}. Please submit meter readings.`,
            countdownLabel: 'days until closing',
            alert: '',
            button: 'Submit readings',
            note: 'If readings have already been submitted, no further action is needed.',
        };
    }
    if (stage === 'end') {
        return {
            subject: `Meter reading submission period is ending - ${params.brandName || 'Domera'}`,
            title: 'Submission period is ending',
            badge: badge || 'Meter readings',
            body: `Hello${params.tenantName ? `, <strong>${params.tenantName}</strong>` : ''}. Please submit readings if you have not done so yet.`,
            countdownLabel: 'days until closing',
            alert: '',
            button: 'Submit readings',
            note: 'This reminder is sent only if readings for the current period have not been received yet.',
        };
    }
    return {
        subject: `Time to submit your meter readings - ${params.brandName || 'Domera'}`,
        title: 'Submit meter readings',
        badge: badge || 'Meter readings',
        body: `Hello${params.tenantName ? `, <strong>${params.tenantName}</strong>` : ''}. It is time to submit meter readings.`,
        countdownLabel: 'days until closing',
        alert: '',
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
                location: propertyLocation(params, 'en'),
                children: `
        ${(0, email_layout_template_1.paragraph)(copy.body.replace('. ', '.<br />'), 'center')}
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
                location: propertyLocation(params, 'ru'),
                children: `
        ${(0, email_layout_template_1.paragraph)(copy.body.replace('. ', '.<br />'), 'center')}
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
                location: propertyLocation(params, 'lv'),
                children: `
        ${(0, email_layout_template_1.paragraph)(copy.body.replace('. ', '.<br />'), 'center')}
        ${closingSummaryBox(params, copy.countdownLabel, 'Iesniegšanas periods', 'līdz')}
        ${copy.alert ? (0, email_layout_template_1.alertBox)(copy.alert) : ''}
        ${(0, email_layout_template_1.button)(copy.button, params.submissionLink)}
        ${(0, email_layout_template_1.note)(copy.note)}
      `,
            }),
        };
    },
};
