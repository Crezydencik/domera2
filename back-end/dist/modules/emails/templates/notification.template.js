"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationTemplates = void 0;
const baseStyles = {
    container: 'font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;',
    heading: 'margin:0 0 12px;font-size:24px;font-weight:700;',
    paragraph: 'margin:0 0 12px;line-height:1.6;',
    button: 'display:inline-block;padding:12px 24px;background:#4f46e5;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;',
    footer: 'margin:20px 0 0;padding:16px 0;border-top:1px solid #e2e8f0;color:#64748b;font-size:13px;line-height:1.5;',
};
exports.notificationTemplates = {
    en: (params) => ({
        subject: params.title,
        html: `
      <div style="${baseStyles.container}">
        <h2 style="${baseStyles.heading}">${params.title}</h2>
        <div style="${baseStyles.paragraph}">
          ${params.message}
        </div>
        ${params.actionLabel && params.actionLink
            ? `
        <p style="${baseStyles.paragraph}">
          <a href="${params.actionLink}" style="${baseStyles.button}">${params.actionLabel}</a>
        </p>
        `
            : ''}
        <div style="${baseStyles.footer}">
          <p>${params.footer || 'This is an automated notification from Domera.'}</p>
        </div>
      </div>
    `,
    }),
    ru: (params) => ({
        subject: params.title,
        html: `
      <div style="${baseStyles.container}">
        <h2 style="${baseStyles.heading}">${params.title}</h2>
        <div style="${baseStyles.paragraph}">
          ${params.message}
        </div>
        ${params.actionLabel && params.actionLink
            ? `
        <p style="${baseStyles.paragraph}">
          <a href="${params.actionLink}" style="${baseStyles.button}">${params.actionLabel}</a>
        </p>
        `
            : ''}
        <div style="${baseStyles.footer}">
          <p>${params.footer || 'Это автоматическое уведомление от Domera.'}</p>
        </div>
      </div>
    `,
    }),
    lv: (params) => ({
        subject: params.title,
        html: `
      <div style="${baseStyles.container}">
        <h2 style="${baseStyles.heading}">${params.title}</h2>
        <div style="${baseStyles.paragraph}">
          ${params.message}
        </div>
        ${params.actionLabel && params.actionLink
            ? `
        <p style="${baseStyles.paragraph}">
          <a href="${params.actionLink}" style="${baseStyles.button}">${params.actionLabel}</a>
        </p>
        `
            : ''}
        <div style="${baseStyles.footer}">
          <p>${params.footer || 'Šis ir automātisks paziņojums no Domera.'}</p>
        </div>
      </div>
    `,
    }),
};
