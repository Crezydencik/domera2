"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationTemplates = void 0;
const email_layout_template_1 = require("./email-layout.template");
function escapeHtml(value) {
    return (value ?? '').replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character] ?? character);
}
function safeUrl(value) {
    if (!value)
        return '';
    try {
        const url = new URL(value);
        return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
    }
    catch {
        return '';
    }
}
function action(params) {
    const href = safeUrl(params.actionLink);
    if (!params.actionLabel || !href)
        return '';
    return (0, email_layout_template_1.button)(escapeHtml(params.actionLabel), escapeHtml(href));
}
exports.notificationTemplates = {
    en: (params) => ({
        subject: params.title,
        html: (0, email_layout_template_1.renderEmailLayout)({
            language: 'en',
            title: escapeHtml(params.title),
            badge: params.badge || 'Notification',
            brandName: params.brandName,
            accentColor: params.accentColor,
            logoDataUrl: params.logoDataUrl,
            children: `
        <div style="${email_layout_template_1.emailStyles.paragraph}">${params.messageHtml || escapeHtml(params.message).replace(/\n/g, '<br />')}</div>
        ${action(params)}
      `,
        }),
    }),
    ru: (params) => ({
        subject: params.title,
        html: (0, email_layout_template_1.renderEmailLayout)({
            language: 'ru',
            title: escapeHtml(params.title),
            badge: params.badge || 'Уведомление',
            brandName: params.brandName,
            accentColor: params.accentColor,
            logoDataUrl: params.logoDataUrl,
            children: `
        <div style="${email_layout_template_1.emailStyles.paragraph}">${params.messageHtml || escapeHtml(params.message).replace(/\n/g, '<br />')}</div>
        ${action(params)}
      `,
        }),
    }),
    lv: (params) => ({
        subject: params.title,
        html: (0, email_layout_template_1.renderEmailLayout)({
            language: 'lv',
            title: escapeHtml(params.title),
            badge: params.badge || 'Paziņojums',
            brandName: params.brandName,
            accentColor: params.accentColor,
            logoDataUrl: params.logoDataUrl,
            children: `
        <div style="${email_layout_template_1.emailStyles.paragraph}">${params.messageHtml || escapeHtml(params.message).replace(/\n/g, '<br />')}</div>
        ${action(params)}
      `,
        }),
    }),
};
