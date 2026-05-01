"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tenantInvitedByOwnerTemplates = void 0;
const baseStyles = {
    container: 'font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;',
    heading: 'margin:0 0 12px;font-size:24px;font-weight:700;',
    paragraph: 'margin:0 0 12px;line-height:1.6;',
    button: 'display:inline-block;padding:12px 24px;background:#4f46e5;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;',
    infoBox: 'background:#f0f9ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px;margin:12px 0;',
    footer: 'margin:20px 0 0;padding:16px 0;border-top:1px solid #e2e8f0;color:#64748b;font-size:13px;line-height:1.5;',
};
exports.tenantInvitedByOwnerTemplates = {
    en: (params) => ({
        subject: 'Invitation to manage your apartment on Domera',
        html: `
      <div style="${baseStyles.container}">
        <h2 style="${baseStyles.heading}">Your landlord has invited you to Domera</h2>
        <p style="${baseStyles.paragraph}">
          Hello${params.tenantName ? ` ${params.tenantName}` : ''},
        </p>
        <p style="${baseStyles.paragraph}">
          ${params.ownerName} has invited you to join Domera to manage ${params.apartmentNumber ? `apartment ${params.apartmentNumber}` : 'your apartment'}${params.buildingName ? ` in ${params.buildingName}` : ''}.
        </p>
        <div style="${baseStyles.infoBox}">
          <strong>What's included:</strong>
          <ul style="margin:8px 0 0;padding-left:20px;">
            <li>View meter readings</li>
            <li>Receive invoices</li>
            <li>Communicate with landlord</li>
            <li>Submit maintenance requests</li>
          </ul>
        </div>
        <p style="${baseStyles.paragraph}">
          <a href="${params.invitationLink}" style="${baseStyles.button}">Accept Invitation</a>
        </p>
        <div style="${baseStyles.footer}">
          <p>This invitation link is valid for 7 days.</p>
        </div>
      </div>
    `,
    }),
    ru: (params) => ({
        subject: 'Приглашение управлять вашей квартирой в Domera',
        html: `
      <div style="${baseStyles.container}">
        <h2 style="${baseStyles.heading}">Ваш домовладелец приглашает вас в Domera</h2>
        <p style="${baseStyles.paragraph}">
          Здравствуйте${params.tenantName ? `, ${params.tenantName}` : ''},
        </p>
        <p style="${baseStyles.paragraph}">
          ${params.ownerName} приглашает вас присоединиться к Domera для управления ${params.apartmentNumber ? `квартирой ${params.apartmentNumber}` : 'вашей квартирой'}${params.buildingName ? ` в ${params.buildingName}` : ''}.
        </p>
        <div style="${baseStyles.infoBox}">
          <strong>Что включено:</strong>
          <ul style="margin:8px 0 0;padding-left:20px;">
            <li>Просмотр показаний счетчиков</li>
            <li>Получение счетов</li>
            <li>Связь с домовладельцем</li>
            <li>Подача заявок на ремонт</li>
          </ul>
        </div>
        <p style="${baseStyles.paragraph}">
          <a href="${params.invitationLink}" style="${baseStyles.button}">Принять приглашение</a>
        </p>
        <div style="${baseStyles.footer}">
          <p>Ссылка приглашения действительна 7 дней.</p>
        </div>
      </div>
    `,
    }),
    lv: (params) => ({
        subject: 'Uzaicinājums pārvaldīt savu dzīvokli Domera',
        html: `
      <div style="${baseStyles.container}">
        <h2 style="${baseStyles.heading}">Jūsu mājas īpašnieks Jūs aicina uz Domera</h2>
        <p style="${baseStyles.paragraph}">
          Sveiki${params.tenantName ? `, ${params.tenantName}` : ''},
        </p>
        <p style="${baseStyles.paragraph}">
          ${params.ownerName} Jūs aicina pievienoties Domera, lai pārvaldītu ${params.apartmentNumber ? `dzīvokli ${params.apartmentNumber}` : 'savu dzīvokli'}${params.buildingName ? ` ${params.buildingName}` : ''}.
        </p>
        <div style="${baseStyles.infoBox}">
          <strong>Kas ir iekļauts:</strong>
          <ul style="margin:8px 0 0;padding-left:20px;">
            <li>Skatīt skaitītāja rādījumus</li>
            <li>Saņemt rēķinus</li>
            <li>Sazināties ar mājas īpašnieku</li>
            <li>Iesniegt remonta pieprasījumus</li>
          </ul>
        </div>
        <p style="${baseStyles.paragraph}">
          <a href="${params.invitationLink}" style="${baseStyles.button}">Pieņemt uzaicinājumu</a>
        </p>
        <div style="${baseStyles.footer}">
          <p>Uzaicinājuma saite ir derīga 7 dienas.</p>
        </div>
      </div>
    `,
    }),
};
