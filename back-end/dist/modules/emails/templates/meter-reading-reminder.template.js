"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.meterReadingReminderTemplates = void 0;
const email_layout_template_1 = require("./email-layout.template");
function meterItems(params, lastLabel) {
    return params.meters.map((meter) => (`${meter.name}${meter.unit ? ` (${meter.unit})` : ''}${meter.lastReading ? ` - ${lastLabel}: ${meter.lastReading}` : ''}`));
}
exports.meterReadingReminderTemplates = {
    en: (params) => ({
        subject: 'Time to submit your meter readings - Domera',
        html: (0, email_layout_template_1.renderEmailLayout)({
            language: 'en',
            title: 'Submit meter readings',
            badge: params.buildingName || 'Meter readings',
            children: `
        ${(0, email_layout_template_1.paragraph)(`Hello${params.tenantName ? `, <strong>${params.tenantName}</strong>` : ''}. It is time to submit meter readings${params.apartmentNumber ? ` for apartment ${params.apartmentNumber}` : ''}.`)}
        ${(0, email_layout_template_1.infoBox)('Meters to read:', (0, email_layout_template_1.bulletList)(meterItems(params, 'Last')))}
        ${params.deadline ? (0, email_layout_template_1.alertBox)(`Please submit by: <strong>${params.deadline}</strong>`) : ''}
        ${(0, email_layout_template_1.button)('Submit readings', params.submissionLink)}
        ${(0, email_layout_template_1.note)('Accurate meter readings help calculate fair bills for all residents.')}
      `,
        }),
    }),
    ru: (params) => ({
        subject: 'Время отправить показания счетчиков - Domera',
        html: (0, email_layout_template_1.renderEmailLayout)({
            language: 'ru',
            title: 'Отправьте показания счётчиков',
            badge: params.buildingName || 'Показания',
            children: `
        ${(0, email_layout_template_1.paragraph)(`Здравствуйте${params.tenantName ? `, <strong>${params.tenantName}</strong>` : ''}. Пришло время отправить показания${params.apartmentNumber ? ` для квартиры ${params.apartmentNumber}` : ''}.`)}
        ${(0, email_layout_template_1.infoBox)('Счётчики:', (0, email_layout_template_1.bulletList)(meterItems(params, 'Последнее')))}
        ${params.deadline ? (0, email_layout_template_1.alertBox)(`Пожалуйста, отправьте до: <strong>${params.deadline}</strong>`) : ''}
        ${(0, email_layout_template_1.button)('Отправить показания', params.submissionLink)}
        ${(0, email_layout_template_1.note)('Точные показания помогают рассчитать справедливые счета для всех жильцов.')}
      `,
        }),
    }),
    lv: (params) => ({
        subject: 'Laiks iesniegt skaitītāja rādījumus - Domera',
        html: (0, email_layout_template_1.renderEmailLayout)({
            language: 'lv',
            title: 'Iesniedziet skaitītāju rādījumus',
            badge: params.buildingName || 'Rādījumi',
            children: `
        ${(0, email_layout_template_1.paragraph)(`Sveiki${params.tenantName ? `, <strong>${params.tenantName}</strong>` : ''}. Pienācis laiks iesniegt rādījumus${params.apartmentNumber ? ` dzīvoklim ${params.apartmentNumber}` : ''}.`)}
        ${(0, email_layout_template_1.infoBox)('Skaitītāji:', (0, email_layout_template_1.bulletList)(meterItems(params, 'Pēdējais')))}
        ${params.deadline ? (0, email_layout_template_1.alertBox)(`Lūdzu, iesniedziet līdz: <strong>${params.deadline}</strong>`) : ''}
        ${(0, email_layout_template_1.button)('Iesniegt rādījumus', params.submissionLink)}
        ${(0, email_layout_template_1.note)('Precīzi skaitītāju rādījumi palīdz aprēķināt taisnīgus rēķinus visiem iedzīvotājiem.')}
      `,
        }),
    }),
};
