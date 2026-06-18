"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.passwordResetTemplates = void 0;
const email_layout_template_1 = require("./email-layout.template");
exports.passwordResetTemplates = {
    en: (resetLink) => ({
        subject: 'Domera password reset',
        html: (0, email_layout_template_1.renderEmailLayout)({
            language: 'en',
            title: 'Reset your password',
            badge: 'Security',
            children: `
        ${(0, email_layout_template_1.paragraph)('Click the button below to create a new password.')}
        ${(0, email_layout_template_1.button)('Reset password', resetLink)}
        ${(0, email_layout_template_1.note)('This link is valid for 24 hours. If you did not request a password reset, you can safely ignore this email.')}
      `,
        }),
    }),
    ru: (resetLink) => ({
        subject: 'Сброс пароля Domera',
        html: (0, email_layout_template_1.renderEmailLayout)({
            language: 'ru',
            title: 'Сброс пароля',
            badge: 'Безопасность',
            children: `
        ${(0, email_layout_template_1.paragraph)('Нажмите кнопку ниже, чтобы создать новый пароль.')}
        ${(0, email_layout_template_1.button)('Сбросить пароль', resetLink)}
        ${(0, email_layout_template_1.note)('Ссылка действительна в течение 24 часов. Если вы не запрашивали сброс пароля, письмо можно просто проигнорировать.')}
      `,
        }),
    }),
    lv: (resetLink) => ({
        subject: 'Domera paroles atiestatīšana',
        html: (0, email_layout_template_1.renderEmailLayout)({
            language: 'lv',
            title: 'Atiestatīt paroli',
            badge: 'Drošība',
            children: `
        ${(0, email_layout_template_1.paragraph)('Nospiediet pogu zemāk, lai izveidotu jaunu paroli.')}
        ${(0, email_layout_template_1.button)('Atiestatīt paroli', resetLink)}
        ${(0, email_layout_template_1.note)('Saite ir derīga 24 stundas. Ja neesat pieprasījis paroles atiestatīšanu, varat droši ignorēt šo e-pastu.')}
      `,
        }),
    }),
};
