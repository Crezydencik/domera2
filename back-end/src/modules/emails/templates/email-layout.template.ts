import { EmailLanguage } from '../email.types';

export const emailStyles = {
  paragraph: 'margin:0 auto 24px;max-width:560px;line-height:1.7;font-size:17px;color:#1e293b;text-align:center;',
  button:
    'display:inline-block;margin:2px 0 28px;padding:15px 34px;border:1px solid #155DFC;background:#155DFC;color:#ffffff;text-decoration:none;border-radius:8px;font-size:17px;font-weight:700;box-shadow:0 10px 24px rgba(21,93,252,0.28);',
  note: 'margin:0 auto;max-width:540px;font-size:15px;line-height:1.6;color:#475569;text-align:center;',
  details:
    'width:100%;max-width:500px;margin:0 auto 30px;border-collapse:separate;border-spacing:0;background:#f8fbff;border:1px solid #dbeafe;border-radius:10px;overflow:hidden;',
  detailLabel:
    'padding:14px 18px;text-align:left;font-size:12px;line-height:1.4;color:#64748b;text-transform:uppercase;letter-spacing:0.4px;border-bottom:1px solid #e0ecff;white-space:nowrap;',
  detailValue:
    'padding:14px 18px;text-align:right;font-size:17px;line-height:1.4;font-weight:700;color:#1e293b;border-bottom:1px solid #e0ecff;',
  infoBox:
    'max-width:540px;margin:0 auto 28px;padding:18px 20px;background:#f8fbff;border:1px solid #dbeafe;border-radius:10px;text-align:left;color:#1e293b;',
  infoTitle: 'margin:0 0 10px;font-size:15px;font-weight:700;color:#1e293b;',
  list: 'margin:0;padding-left:20px;font-size:15px;line-height:1.7;color:#334155;',
  codeBox:
    'display:inline-block;margin:2px 0 28px;padding:16px 22px;background:#f8fbff;border:1px solid #bfdbfe;border-radius:10px;color:#155DFC;font-size:36px;font-weight:800;letter-spacing:7px;',
  alert:
    'max-width:540px;margin:0 auto 28px;padding:14px 18px;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;color:#9a3412;font-size:15px;line-height:1.6;text-align:center;',
};

const footerByLanguage: Record<EmailLanguage, string> = {
  en: 'This is an automatically generated email, please do not reply.',
  ru: 'Это автоматическое письмо, пожалуйста, не отвечайте на него.',
  lv: 'Šis ir automātiski sagatavots e-pasts, lūdzam uz to neatbildēt.',
};

export function renderEmailLayout(params: {
  language: EmailLanguage;
  title: string;
  children: string;
  badge?: string;
  footer?: string;
}) {
  return `
    <div style="margin:0;padding:36px 16px;background:#eef4ff;font-family:Arial,sans-serif;color:#1e293b;">
      <div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #dbeafe;border-radius:14px;overflow:hidden;text-align:center;box-shadow:0 18px 45px rgba(15,23,42,0.10);">
        <div style="background:#155DFC;padding:38px 32px 42px;text-align:center;color:#ffffff;">
          <div style="margin:0 0 16px;font-size:40px;font-weight:800;letter-spacing:2px;color:#ffffff;">DOMERA</div>
          ${params.badge ? `<p style="display:inline-block;margin:0 0 18px;padding:8px 16px;border:1px solid rgba(255,255,255,0.34);border-radius:999px;background:rgba(255,255,255,0.14);font-size:14px;font-weight:700;color:#ffffff;">${params.badge}</p>` : ''}
          <h2 style="margin:0;font-size:28px;font-weight:700;color:#ffffff;line-height:1.35;">${params.title}</h2>
        </div>
        <div style="padding:38px 34px 44px;text-align:center;">
          ${params.children}
        </div>
      </div>
      <p style="max-width:760px;margin:18px auto 0;text-align:center;color:#64748b;font-size:12px;line-height:1.5;">${params.footer || footerByLanguage[params.language]}</p>
    </div>
  `;
}

export function paragraph(content: string): string {
  return `<p style="${emailStyles.paragraph}">${content}</p>`;
}

export function note(content: string): string {
  return `<p style="${emailStyles.note}">${content}</p>`;
}

export function button(label: string, href: string): string {
  return `<a href="${href}" style="${emailStyles.button}">${label}</a>`;
}

export function detailRows(rows: Array<{ label: string; value?: string }>): string {
  const visibleRows = rows.filter((row) => row.value?.trim());
  if (!visibleRows.length) return '';

  return `
    <table role="presentation" style="${emailStyles.details}">
      <tbody>
        ${visibleRows
          .map(
            (row) => `
              <tr>
                <td style="${emailStyles.detailLabel}">${row.label}</td>
                <td style="${emailStyles.detailValue}">${row.value}</td>
              </tr>
            `,
          )
          .join('')}
      </tbody>
    </table>
  `;
}

export function infoBox(title: string, body: string): string {
  return `
    <div style="${emailStyles.infoBox}">
      <p style="${emailStyles.infoTitle}">${title}</p>
      ${body}
    </div>
  `;
}

export function bulletList(items: string[]): string {
  return `<ul style="${emailStyles.list}">${items.map((item) => `<li>${item}</li>`).join('')}</ul>`;
}

export function codeBox(code: string): string {
  return `<div style="${emailStyles.codeBox}">${code}</div>`;
}

export function alertBox(content: string): string {
  return `<div style="${emailStyles.alert}">${content}</div>`;
}
