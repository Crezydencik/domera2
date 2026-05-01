"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.invoiceGeneratedTemplates = void 0;
const baseStyles = {
    container: 'font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;',
    heading: 'margin:0 0 12px;font-size:24px;font-weight:700;',
    subHeading: 'margin:12px 0 8px;font-size:16px;font-weight:600;',
    paragraph: 'margin:0 0 12px;line-height:1.6;',
    button: 'display:inline-block;padding:12px 24px;background:#4f46e5;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;',
    infoBox: 'background:#f0f9ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px;margin:12px 0;',
    footer: 'margin:20px 0 0;padding:16px 0;border-top:1px solid #e2e8f0;color:#64748b;font-size:13px;line-height:1.5;',
};
exports.invoiceGeneratedTemplates = {
    en: (params) => ({
        subject: `Invoice #${params.invoiceNumber} is ready - Domera`,
        html: `
      <div style="${baseStyles.container}">
        <h2 style="${baseStyles.heading}">Your invoice is ready</h2>
        <p style="${baseStyles.paragraph}">
          Hello${params.tenantName ? ` ${params.tenantName}` : ''},
        </p>
        <p style="${baseStyles.paragraph}">
          A new invoice has been generated for your ${params.apartmentNumber ? `apartment ${params.apartmentNumber}` : 'unit'}${params.buildingName ? ` in ${params.buildingName}` : ''}.
        </p>
        <div style="${baseStyles.infoBox}">
          <p style="margin:0;"><strong>Invoice #:</strong> ${params.invoiceNumber}</p>
          <p style="margin:8px 0 0;"><strong>Amount:</strong> ${params.amount}</p>
          <p style="margin:8px 0 0;"><strong>Due Date:</strong> ${params.dueDate}</p>
        </div>
        <p style="${baseStyles.paragraph}">
          <a href="${params.invoiceLink}" style="${baseStyles.button}">View & Pay Invoice</a>
        </p>
        <div style="${baseStyles.footer}">
          <p>Please ensure payment by the due date to avoid late fees.</p>
        </div>
      </div>
    `,
    }),
    ru: (params) => ({
        subject: `Счет #${params.invoiceNumber} готов - Domera`,
        html: `
      <div style="${baseStyles.container}">
        <h2 style="${baseStyles.heading}">Ваш счет готов</h2>
        <p style="${baseStyles.paragraph}">
          Здравствуйте${params.tenantName ? `, ${params.tenantName}` : ''},
        </p>
        <p style="${baseStyles.paragraph}">
          Новый счет был сгенерирован для вашей ${params.apartmentNumber ? `квартиры ${params.apartmentNumber}` : 'единицы'}${params.buildingName ? ` в ${params.buildingName}` : ''}.
        </p>
        <div style="${baseStyles.infoBox}">
          <p style="margin:0;"><strong>Номер счета:</strong> ${params.invoiceNumber}</p>
          <p style="margin:8px 0 0;"><strong>Сумма:</strong> ${params.amount}</p>
          <p style="margin:8px 0 0;"><strong>Срок оплаты:</strong> ${params.dueDate}</p>
        </div>
        <p style="${baseStyles.paragraph}">
          <a href="${params.invoiceLink}" style="${baseStyles.button}">Просмотреть и оплатить</a>
        </p>
        <div style="${baseStyles.footer}">
          <p>Пожалуйста, обеспечьте оплату до указанной даты, чтобы избежать штрафа.</p>
        </div>
      </div>
    `,
    }),
    lv: (params) => ({
        subject: `Rēķins #${params.invoiceNumber} ir gatavs - Domera`,
        html: `
      <div style="${baseStyles.container}">
        <h2 style="${baseStyles.heading}">Jūsu rēķins ir gatavs</h2>
        <p style="${baseStyles.paragraph}">
          Sveiki${params.tenantName ? `, ${params.tenantName}` : ''},
        </p>
        <p style="${baseStyles.paragraph}">
          Jūsu ${params.apartmentNumber ? `dzīvoklim ${params.apartmentNumber}` : 'vienībai'}${params.buildingName ? ` ${params.buildingName}` : ''} ir ģenerēts jauns rēķins.
        </p>
        <div style="${baseStyles.infoBox}">
          <p style="margin:0;"><strong>Rēķina numurs:</strong> ${params.invoiceNumber}</p>
          <p style="margin:8px 0 0;"><strong>Summa:</strong> ${params.amount}</p>
          <p style="margin:8px 0 0;"><strong>Maksāšanas termiņš:</strong> ${params.dueDate}</p>
        </div>
        <p style="${baseStyles.paragraph}">
          <a href="${params.invoiceLink}" style="${baseStyles.button}">Skatīt un apmaksāt</a>
        </p>
        <div style="${baseStyles.footer}">
          <p>Lūdzu, apmaksājiet līdz termiņam, lai izvairītos no kavēšanās maksas.</p>
        </div>
      </div>
    `,
    }),
};
