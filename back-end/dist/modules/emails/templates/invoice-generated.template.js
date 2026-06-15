"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.invoiceGeneratedTemplates = void 0;
const baseStyles = {
    page: 'margin:0;padding:32px 16px;background:#f8fafc;font-family:Arial,sans-serif;color:#334155;',
    card: 'max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;padding:40px 32px;text-align:center;',
    logo: 'margin:0 0 28px;font-size:34px;font-weight:800;letter-spacing:1px;color:#ef3340;',
    company: 'margin:0 0 20px;font-size:16px;font-weight:700;color:#334155;',
    heading: 'margin:0 0 28px;font-size:22px;font-weight:700;color:#475569;line-height:1.35;',
    row: 'margin:12px 0;font-size:16px;line-height:1.5;',
    value: 'font-weight:700;color:#475569;',
    button: 'display:inline-block;margin:24px 0 34px;padding:13px 32px;border:1px solid #ef3340;border-radius:4px;color:#ef3340;text-decoration:none;font-size:16px;font-weight:700;',
    note: 'margin:0;font-size:15px;line-height:1.6;color:#334155;',
    footer: 'max-width:640px;margin:16px auto 0;text-align:center;font-size:12px;line-height:1.5;color:#64748b;',
};
exports.invoiceGeneratedTemplates = {
    en: (params) => ({
        subject: `Invoice ${params.invoiceNumber} is ready - Domera`,
        html: `
      <div style="${baseStyles.page}">
        <div style="${baseStyles.card}">
          <div style="${baseStyles.logo}">DOMERA</div>
          <p style="${baseStyles.company}">${params.buildingName || 'Domera'}</p>
          <h2 style="${baseStyles.heading}">Invoice for services ${params.invoiceNumber}</h2>
          ${params.tenantName ? `<p style="${baseStyles.row}">Hello, <span style="${baseStyles.value}">${params.tenantName}</span></p>` : ''}
          ${params.apartmentNumber ? `<p style="${baseStyles.row}">Apartment <span style="${baseStyles.value}">${params.apartmentNumber}</span></p>` : ''}
          <p style="${baseStyles.row}">Amount <span style="${baseStyles.value}">${params.amount}</span></p>
          <p style="${baseStyles.row}">Due date <span style="${baseStyles.value}">${params.dueDate || '-'}</span></p>
          <a href="${params.invoiceLink}" style="${baseStyles.button}">View invoice</a>
          <p style="${baseStyles.note}">The invoice is attached to this email.</p>
          <p style="${baseStyles.note}">Detailed invoice information is available by the button above.</p>
        </div>
        <p style="${baseStyles.footer}">This is an automatically generated email, please do not reply.</p>
      </div>
    `,
    }),
    ru: (params) => ({
        subject: `Счёт ${params.invoiceNumber} готов - Domera`,
        html: `
      <div style="${baseStyles.page}">
        <div style="${baseStyles.card}">
          <div style="${baseStyles.logo}">DOMERA</div>
          <p style="${baseStyles.company}">${params.buildingName || 'Domera'}</p>
          <h2 style="${baseStyles.heading}">Счёт за услуги ${params.invoiceNumber}</h2>
          ${params.tenantName ? `<p style="${baseStyles.row}">Здравствуйте, <span style="${baseStyles.value}">${params.tenantName}</span></p>` : ''}
          ${params.apartmentNumber ? `<p style="${baseStyles.row}">Квартира <span style="${baseStyles.value}">${params.apartmentNumber}</span></p>` : ''}
          <p style="${baseStyles.row}">Сумма <span style="${baseStyles.value}">${params.amount}</span></p>
          <p style="${baseStyles.row}">Срок <span style="${baseStyles.value}">${params.dueDate || '-'}</span></p>
          <a href="${params.invoiceLink}" style="${baseStyles.button}">Посмотреть</a>
          <p style="${baseStyles.note}">Счёт прикреплён к этому письму.</p>
          <p style="${baseStyles.note}">Детальная информация доступна по кнопке выше.</p>
        </div>
        <p style="${baseStyles.footer}">Это автоматическое письмо, пожалуйста, не отвечайте на него.</p>
      </div>
    `,
    }),
    lv: (params) => ({
        subject: `Rēķins ${params.invoiceNumber} ir gatavs - Domera`,
        html: `
      <div style="${baseStyles.page}">
        <div style="${baseStyles.card}">
          <div style="${baseStyles.logo}">DOMERA</div>
          <p style="${baseStyles.company}">${params.buildingName || 'Domera'}</p>
          <h2 style="${baseStyles.heading}">Rēķins par pakalpojumiem ${params.invoiceNumber}</h2>
          ${params.tenantName ? `<p style="${baseStyles.row}">Sveiki, <span style="${baseStyles.value}">${params.tenantName}</span></p>` : ''}
          ${params.apartmentNumber ? `<p style="${baseStyles.row}">Dzīvoklis <span style="${baseStyles.value}">${params.apartmentNumber}</span></p>` : ''}
          <p style="${baseStyles.row}">Summa <span style="${baseStyles.value}">${params.amount}</span></p>
          <p style="${baseStyles.row}">Termiņš <span style="${baseStyles.value}">${params.dueDate || '-'}</span></p>
          <a href="${params.invoiceLink}" style="${baseStyles.button}">Skatīt</a>
          <p style="${baseStyles.note}">Rēķins ir pievienots šim e-pastam.</p>
          <p style="${baseStyles.note}">Detalizēta rēķina informācija ir pieejama ar pogu augstāk.</p>
        </div>
        <p style="${baseStyles.footer}">Šis ir automātiski sagatavots e-pasts, lūdzam uz to neatbildēt.</p>
      </div>
    `,
    }),
};
