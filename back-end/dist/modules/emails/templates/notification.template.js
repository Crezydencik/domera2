"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationTemplates = void 0;
const email_layout_template_1 = require("./email-layout.template");
function action(params) {
    if (!params.actionLabel || !params.actionLink)
        return '';
    return (0, email_layout_template_1.button)(params.actionLabel, params.actionLink);
}
exports.notificationTemplates = {
    en: (params) => ({
        subject: params.title,
        html: (0, email_layout_template_1.renderEmailLayout)({
            language: 'en',
            title: params.title,
            badge: 'Notification',
            children: `
        <div style="${email_layout_template_1.emailStyles.paragraph}">${params.message}</div>
        ${action(params)}
        ${(0, email_layout_template_1.note)(params.footer || 'This is an automated notification from Domera.')}
      `,
        }),
    }),
    ru: (params) => ({
        subject: params.title,
        html: (0, email_layout_template_1.renderEmailLayout)({
            language: 'ru',
            title: params.title,
            badge: 'Уведомление',
            children: `
        <div style="${email_layout_template_1.emailStyles.paragraph}">${params.message}</div>
        ${action(params)}
        ${(0, email_layout_template_1.note)(params.footer || 'Это автоматическое уведомление от Domera.')}
      `,
        }),
    }),
    lv: (params) => ({
        subject: params.title,
        html: (0, email_layout_template_1.renderEmailLayout)({
            language: 'lv',
            title: params.title,
            badge: 'Paziņojums',
            children: `
        <div style="${email_layout_template_1.emailStyles.paragraph}">${params.message}</div>
        ${action(params)}
        ${(0, email_layout_template_1.note)(params.footer || 'Šis ir automātisks paziņojums no Domera.')}
      `,
        }),
    }),
};
