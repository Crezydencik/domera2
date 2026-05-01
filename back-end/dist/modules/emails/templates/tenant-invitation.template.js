"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tenantInvitationTemplates = void 0;
const baseStyles = {
    container: 'font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;',
    heading: 'margin:0 0 12px;font-size:24px;font-weight:700;',
    paragraph: 'margin:0 0 12px;line-height:1.6;',
    button: 'display:inline-block;padding:12px 24px;background:#4f46e5;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;',
    footer: 'margin:20px 0 0;padding:16px 0;border-top:1px solid #e2e8f0;color:#64748b;font-size:13px;line-height:1.5;',
};
exports.tenantInvitationTemplates = {
    en: (params) => ({
        subject: `Welcome to Domera - ${params.companyName}`,
        html: `
      <div style="${baseStyles.container}">
        <h2 style="${baseStyles.heading}">You're invited to join Domera</h2>
        <p style="${baseStyles.paragraph}">
          ${params.senderName ? `${params.senderName} from` : ''} ${params.companyName} has invited you to Domera,
          where you can manage your residential life easily.
        </p>
        ${params.buildingName || params.apartmentNumber ? `<p style="${baseStyles.paragraph}"><strong>Your property:</strong> ${params.buildingName || ''}${params.apartmentNumber ? ` - Apt. ${params.apartmentNumber}` : ''}</p>` : ''}
        <p style="${baseStyles.paragraph}">
          With Domera, you can:
        </p>
        <ul style="margin:0 0 12px;padding-left:24px;">
          <li>View meter readings and utilities</li>
          <li>Receive and pay invoices online</li>
          <li>Contact building management instantly</li>
          <li>Access important documents</li>
        </ul>
        <p style="${baseStyles.paragraph}">
          <a href="${params.invitationLink}" style="${baseStyles.button}">Start Now</a>
        </p>
        <div style="${baseStyles.footer}">
          <p>This invitation link is valid for 7 days.</p>
        </div>
      </div>
    `,
    }),
    ru: (params) => ({
        subject: `Добро пожаловать в Domera - ${params.companyName}`,
        html: `
      <div style="${baseStyles.container}">
        <h2 style="${baseStyles.heading}">Вы приглашены присоединиться к Domera</h2>
        <p style="${baseStyles.paragraph}">
          ${params.senderName ? `${params.senderName} из` : ''} ${params.companyName} приглашает вас на Domera,
          где вы можете легко управлять своей жизнью в доме.
        </p>
        ${params.buildingName || params.apartmentNumber ? `<p style="${baseStyles.paragraph}"><strong>Ваше жилье:</strong> ${params.buildingName || ''}${params.apartmentNumber ? ` - Кв. ${params.apartmentNumber}` : ''}</p>` : ''}
        <p style="${baseStyles.paragraph}">
          С Domera вы можете:
        </p>
        <ul style="margin:0 0 12px;padding-left:24px;">
          <li>Просматривать показания счетчиков и коммунальные услуги</li>
          <li>Получать и оплачивать счета онлайн</li>
          <li>Связаться с управлением дома</li>
          <li>Получить доступ к важным документам</li>
        </ul>
        <p style="${baseStyles.paragraph}">
          <a href="${params.invitationLink}" style="${baseStyles.button}">Начать сейчас</a>
        </p>
        <div style="${baseStyles.footer}">
          <p>Ссылка приглашения действительна 7 дней.</p>
        </div>
      </div>
    `,
    }),
    lv: (params) => ({
        subject: `Laipni lūdzam Domera - ${params.companyName}`,
        html: `
      <div style="${baseStyles.container}">
        <h2 style="${baseStyles.heading}">Jūs esat aicināts pievienoties Domera</h2>
        <p style="${baseStyles.paragraph}">
          ${params.senderName ? `${params.senderName} no` : ''} ${params.companyName} Jūs aicina uz Domera,
          kur varat viegli pārvaldīt savu dzīvi mājai.
        </p>
        ${params.buildingName || params.apartmentNumber ? `<p style="${baseStyles.paragraph}"><strong>Jūsu īpašums:</strong> ${params.buildingName || ''}${params.apartmentNumber ? ` - Dzīv. ${params.apartmentNumber}` : ''}</p>` : ''}
        <p style="${baseStyles.paragraph}">
          Ar Domera varat:
        </p>
        <ul style="margin:0 0 12px;padding-left:24px;">
          <li>Skatīt skaitītāja rādījumus un komunāļus</li>
          <li>Saņemt un apmaksāt rēķinus tiešsaistē</li>
          <li>Sazināties ar mājas pārvaldi</li>
          <li>Piekļūt svarīgiem dokumentiem</li>
        </ul>
        <p style="${baseStyles.paragraph}">
          <a href="${params.invitationLink}" style="${baseStyles.button}">Sākt tagad</a>
        </p>
        <div style="${baseStyles.footer}">
          <p>Uzaicinājuma saite ir derīga 7 dienas.</p>
        </div>
      </div>
    `,
    }),
};
