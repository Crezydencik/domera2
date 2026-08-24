"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emailStyles = void 0;
exports.renderEmailLayout = renderEmailLayout;
exports.paragraph = paragraph;
exports.note = note;
exports.button = button;
exports.detailRows = detailRows;
exports.infoBox = infoBox;
exports.bulletList = bulletList;
exports.codeBox = codeBox;
exports.alertBox = alertBox;
exports.emailStyles = {
    paragraph: 'margin:0 auto 22px;max-width:560px;line-height:1.65;font-size:16px;color:#334155;text-align:center;',
    button: 'display:inline-block;margin:2px 0 28px;padding:13px 24px;border:1px solid #155DFC;background:#155DFC;color:#ffffff;text-decoration:none;border-radius:7px;font-size:15px;font-weight:700;box-shadow:0 8px 18px rgba(21,93,252,0.18);',
    note: 'margin:0 auto;max-width:560px;font-size:14px;line-height:1.6;color:#64748b;text-align:center;',
    details: 'width:100%;margin:0 0 30px;border-collapse:separate;border-spacing:0;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;',
    detailLabel: 'padding:14px 18px;text-align:left;font-size:12px;line-height:1.4;color:#64748b;text-transform:uppercase;letter-spacing:0.4px;border-bottom:1px solid #e2e8f0;white-space:nowrap;',
    detailValue: 'padding:14px 18px;text-align:right;font-size:16px;line-height:1.4;font-weight:700;color:#0f172a;border-bottom:1px solid #e2e8f0;',
    infoBox: 'margin:0 0 28px;padding:18px 20px;background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #155DFC;border-radius:8px;text-align:left;color:#1e293b;',
    infoTitle: 'margin:0 0 10px;font-size:15px;font-weight:800;color:#0f172a;',
    list: 'margin:0;padding-left:20px;font-size:15px;line-height:1.7;color:#334155;',
    codeBox: 'display:inline-block;margin:2px 0 28px;padding:16px 22px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;color:#155DFC;font-size:34px;font-weight:800;letter-spacing:7px;',
    alert: 'margin:0 auto 28px;max-width:560px;padding:14px 18px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;color:#9a3412;font-size:15px;line-height:1.6;text-align:center;',
};
const footerByLanguage = {
    en: 'This is an automatically generated email, please do not reply.',
    ru: 'Это автоматическое письмо, пожалуйста, не отвечайте на него.',
    lv: 'Šis ir automātiski sagatavots e-pasts, lūdzam uz to neatbildēt.',
};
function renderEmailLayout(params) {
    const brandName = params.brandName?.trim() || 'DOMERA';
    return `
    <div style="margin:0;padding:32px 16px;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a;">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;text-align:center;box-shadow:0 16px 36px rgba(15,23,42,0.08);">
        <div style="height:5px;background:#155DFC;font-size:0;line-height:0;">&nbsp;</div>
        <div style="padding:30px 32px 28px;border-bottom:1px solid #e2e8f0;background:#ffffff;text-align:center;">
          <div style="margin:0 0 18px;font-size:24px;font-weight:900;letter-spacing:1.8px;color:#0f172a;">${brandName}</div>
          <h2 style="margin:0;font-size:26px;font-weight:800;color:#0f172a;line-height:1.3;">${params.title}</h2>
        </div>
        <div style="padding:32px 34px 38px;text-align:center;">
          ${params.children}
        </div>
      </div>
      <p style="max-width:680px;margin:18px auto 0;text-align:center;color:#64748b;font-size:12px;line-height:1.5;">${params.footer || footerByLanguage[params.language]}</p>
    </div>
  `;
}
function paragraph(content) {
    return `<p style="${exports.emailStyles.paragraph}">${content}</p>`;
}
function note(content) {
    return `<p style="${exports.emailStyles.note}">${content}</p>`;
}
function button(label, href) {
    return `<a href="${href}" style="${exports.emailStyles.button}">${label}</a>`;
}
function detailRows(rows) {
    const visibleRows = rows.filter((row) => row.value?.trim());
    if (!visibleRows.length)
        return '';
    return `
    <table role="presentation" style="${exports.emailStyles.details}">
      <tbody>
        ${visibleRows
        .map((row) => `
              <tr>
                <td style="${exports.emailStyles.detailLabel}">${row.label}</td>
                <td style="${exports.emailStyles.detailValue}">${row.value}</td>
              </tr>
            `)
        .join('')}
      </tbody>
    </table>
  `;
}
function infoBox(title, body) {
    return `
    <div style="${exports.emailStyles.infoBox}">
      <p style="${exports.emailStyles.infoTitle}">${title}</p>
      ${body}
    </div>
  `;
}
function bulletList(items) {
    return `<ul style="${exports.emailStyles.list}">${items.map((item) => `<li>${item}</li>`).join('')}</ul>`;
}
function codeBox(code) {
    return `<div style="${exports.emailStyles.codeBox}">${code}</div>`;
}
function alertBox(content) {
    return `<div style="${exports.emailStyles.alert}">${content}</div>`;
}
