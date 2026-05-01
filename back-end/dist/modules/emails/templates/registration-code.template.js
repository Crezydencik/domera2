"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registrationCodeTemplates = void 0;
const baseStyles = {
    container: 'font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;',
    heading: 'margin:0 0 12px;font-size:24px;font-weight:700;',
    paragraph: 'margin:0 0 12px;line-height:1.6;',
    button: 'display:inline-block;padding:12px 24px;background:#4f46e5;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;',
    codeBox: 'font-size:34px;font-weight:700;letter-spacing:6px;background:#eef2ff;border:1px solid #c7d2fe;border-radius:10px;padding:14px 18px;display:inline-block;',
    footer: 'margin:20px 0 0;padding:16px 0;border-top:1px solid #e2e8f0;color:#64748b;font-size:13px;line-height:1.5;',
};
exports.registrationCodeTemplates = {
    en: (code) => ({
        subject: 'Domera registration verification code',
        html: `
      <div style="${baseStyles.container}">
        <h2 style="${baseStyles.heading}">Confirm your registration</h2>
        <p style="${baseStyles.paragraph}">Enter this code on the registration page:</p>
        <div style="${baseStyles.codeBox}">${code}</div>
        <p style="${baseStyles.paragraph}">This code is valid for 1 hour.</p>
        <div style="${baseStyles.footer}">
          <p>If you did not request this code, please ignore this email.</p>
        </div>
      </div>
    `,
    }),
    ru: (code) => ({
        subject: 'Код подтверждения регистрации Domera',
        html: `
      <div style="${baseStyles.container}">
        <h2 style="${baseStyles.heading}">Подтверждение регистрации</h2>
        <p style="${baseStyles.paragraph}">Введите этот код на странице регистрации:</p>
        <div style="${baseStyles.codeBox}">${code}</div>
        <p style="${baseStyles.paragraph}">Код действителен в течение 1 часа.</p>
        <div style="${baseStyles.footer}">
          <p>Если вы не запрашивали этот код, просто игнорируйте это письмо.</p>
        </div>
      </div>
    `,
    }),
    lv: (code) => ({
        subject: 'Domera reģistrācijas apstiprināšanas kods',
        html: `
      <div style="${baseStyles.container}">
        <h2 style="${baseStyles.heading}">Reģistrācijas apstiprināšana</h2>
        <p style="${baseStyles.paragraph}">Ievadiet šo kodu reģistrācijas lapā:</p>
        <div style="${baseStyles.codeBox}">${code}</div>
        <p style="${baseStyles.paragraph}">Kods ir derīgs 1 stundu.</p>
        <div style="${baseStyles.footer}">
          <p>Ja neesat pieprasījis šo kodu, ignorējiet šo e-pastu.</p>
        </div>
      </div>
    `,
    }),
};
