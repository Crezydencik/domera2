"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.passwordResetTemplates = void 0;
const baseStyles = {
    container: 'font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;',
    heading: 'margin:0 0 12px;font-size:24px;font-weight:700;',
    paragraph: 'margin:0 0 12px;line-height:1.6;',
    button: 'display:inline-block;padding:12px 24px;background:#4f46e5;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;',
    footer: 'margin:20px 0 0;padding:16px 0;border-top:1px solid #e2e8f0;color:#64748b;font-size:13px;line-height:1.5;',
};
exports.passwordResetTemplates = {
    en: (resetLink) => ({
        subject: 'Domera password reset',
        html: `
      <div style="${baseStyles.container}">
        <h2 style="${baseStyles.heading}">Reset your password</h2>
        <p style="${baseStyles.paragraph}">Click the button below to create a new password:</p>
        <p style="${baseStyles.paragraph}">
          <a href="${resetLink}" style="${baseStyles.button}">Reset Password</a>
        </p>
        <div style="${baseStyles.footer}">
          <p>If you didn't request a password reset, please ignore this email.</p>
          <p>This link is valid for 24 hours.</p>
        </div>
      </div>
    `,
    }),
    ru: (resetLink) => ({
        subject: 'Сброс пароля Domera',
        html: `
      <div style="${baseStyles.container}">
        <h2 style="${baseStyles.heading}">Сброс пароля</h2>
        <p style="${baseStyles.paragraph}">Нажмите кнопку ниже, чтобы создать новый пароль:</p>
        <p style="${baseStyles.paragraph}">
          <a href="${resetLink}" style="${baseStyles.button}">Сбросить пароль</a>
        </p>
        <div style="${baseStyles.footer}">
          <p>Если вы не запрашивали сброс пароля, просто игнорируйте это письмо.</p>
          <p>Ссылка действительна в течение 24 часов.</p>
        </div>
      </div>
    `,
    }),
    lv: (resetLink) => ({
        subject: 'Domera paroles atiestatīšana',
        html: `
      <div style="${baseStyles.container}">
        <h2 style="${baseStyles.heading}">Atiestatīt paroli</h2>
        <p style="${baseStyles.paragraph}">Nospiediet pogu zemāk, lai izveidotu jaunu paroli:</p>
        <p style="${baseStyles.paragraph}">
          <a href="${resetLink}" style="${baseStyles.button}">Atiestatīt paroli</a>
        </p>
        <div style="${baseStyles.footer}">
          <p>Ja neesat pieprasījis paroles atiestatīšanu, ignorējiet šo e-pastu.</p>
          <p>Saite ir derīga 24 stundas.</p>
        </div>
      </div>
    `,
    }),
};
