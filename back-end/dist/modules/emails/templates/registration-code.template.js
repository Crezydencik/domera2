"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registrationCodeTemplates = void 0;
const email_layout_template_1 = require("./email-layout.template");
exports.registrationCodeTemplates = {
    en: (code) => ({
        subject: 'Domera registration verification code',
        html: (0, email_layout_template_1.renderEmailLayout)({
            language: 'en',
            title: 'Confirm your registration',
            badge: 'Registration',
            children: `
        ${(0, email_layout_template_1.paragraph)('Enter this code on the registration page:')}
        ${(0, email_layout_template_1.codeBox)(code)}
        ${(0, email_layout_template_1.note)('This code is valid for 1 hour. If you did not request this code, you can safely ignore this email.')}
      `,
        }),
    }),
    ru: (code) => ({
        subject: 'Код подтверждения регистрации Domera',
        html: (0, email_layout_template_1.renderEmailLayout)({
            language: 'ru',
            title: 'Подтверждение регистрации',
            badge: 'Регистрация',
            children: `
        ${(0, email_layout_template_1.paragraph)('Введите этот код на странице регистрации:')}
        ${(0, email_layout_template_1.codeBox)(code)}
        ${(0, email_layout_template_1.note)('Код действителен в течение 1 часа. Если вы не запрашивали этот код, письмо можно просто проигнорировать.')}
      `,
        }),
    }),
    lv: (code) => ({
        subject: 'Domera reģistrācijas apstiprināšanas kods',
        html: (0, email_layout_template_1.renderEmailLayout)({
            language: 'lv',
            title: 'Reģistrācijas apstiprināšana',
            badge: 'Reģistrācija',
            children: `
        ${(0, email_layout_template_1.paragraph)('Ievadiet šo kodu reģistrācijas lapā:')}
        ${(0, email_layout_template_1.codeBox)(code)}
        ${(0, email_layout_template_1.note)('Kods ir derīgs 1 stundu. Ja neesat pieprasījis šo kodu, varat droši ignorēt šo e-pastu.')}
      `,
        }),
    }),
};
