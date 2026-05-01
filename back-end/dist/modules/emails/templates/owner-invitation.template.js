"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ownerInvitationTemplates = void 0;
const baseStyles = {
    container: 'font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;',
    heading: 'margin:0 0 12px;font-size:24px;font-weight:700;',
    paragraph: 'margin:0 0 12px;line-height:1.6;',
    button: 'display:inline-block;padding:12px 24px;background:#4f46e5;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;',
    footer: 'margin:20px 0 0;padding:16px 0;border-top:1px solid #e2e8f0;color:#64748b;font-size:13px;line-height:1.5;',
};
exports.ownerInvitationTemplates = {
    en: (params) => ({
        subject: `Join ${params.companyName} on Domera`,
        html: `
      <div style="${baseStyles.container}">
        <h2 style="${baseStyles.heading}">You're invited to Domera</h2>
        <p style="${baseStyles.paragraph}">
          ${params.senderName ? `${params.senderName} from` : ''} ${params.companyName} has invited you to join Domera,
          a modern property management platform.
        </p>
        <p style="${baseStyles.paragraph}">
          As a property owner, you can:
        </p>
        <ul style="margin:0 0 12px;padding-left:24px;">
          <li>Monitor your properties and apartments</li>
          <li>Track meter readings and utilities</li>
          <li>Manage invoices and payments</li>
          <li>Communicate with tenants and management</li>
        </ul>
        <p style="${baseStyles.paragraph}">
          <a href="${params.invitationLink}" style="${baseStyles.button}">Accept Invitation</a>
        </p>
        <div style="${baseStyles.footer}">
          <p>This invitation link is valid for 7 days. If you do not wish to join, you can ignore this email.</p>
        </div>
      </div>
    `,
    }),
    ru: (params) => ({
        subject: `Присоединитесь к ${params.companyName} в Domera`,
        html: `
      <div style="${baseStyles.container}">
        <h2 style="${baseStyles.heading}">Вы приглашены в Domera</h2>
        <p style="${baseStyles.paragraph}">
          ${params.senderName ? `${params.senderName} из` : ''} ${params.companyName} приглашает вас присоединиться к Domera,
          современной платформе управления недвижимостью.
        </p>
        <p style="${baseStyles.paragraph}">
          Как собственник недвижимости, вы можете:
        </p>
        <ul style="margin:0 0 12px;padding-left:24px;">
          <li>Контролировать свою недвижимость и квартиры</li>
          <li>Отслеживать показания счетчиков и коммунальные услуги</li>
          <li>Управлять счетами и платежами</li>
          <li>Общаться с арендаторами и управлением</li>
        </ul>
        <p style="${baseStyles.paragraph}">
          <a href="${params.invitationLink}" style="${baseStyles.button}">Принять приглашение</a>
        </p>
        <div style="${baseStyles.footer}">
          <p>Ссылка приглашения действительна 7 дней. Если вы не хотите присоединяться, вы можете игнорировать это письмо.</p>
        </div>
      </div>
    `,
    }),
    lv: (params) => ({
        subject: `Pievienojieties ${params.companyName} pakalpojumam Domera`,
        html: `
      <div style="${baseStyles.container}">
        <h2 style="${baseStyles.heading}">Jūs esat aicināts uz Domera</h2>
        <p style="${baseStyles.paragraph}">
          ${params.senderName ? `${params.senderName} no` : ''} ${params.companyName} Jūs aicina pievienoties Domera,
          modernai nekustamā īpašuma pārvaldības platformai.
        </p>
        <p style="${baseStyles.paragraph}">
          Kā nekustamā īpašuma īpašnieks, jūs varat:
        </p>
        <ul style="margin:0 0 12px;padding-left:24px;">
          <li>Uzraudzīt savu īpašumu un dzīvokļus</li>
          <li>Izsekot skaitītāja rādījumiem un komunāļiem</li>
          <li>Pārvaldīt rēķinus un maksājumus</li>
          <li>Sazināties ar īrniekiem un pārvaldi</li>
        </ul>
        <p style="${baseStyles.paragraph}">
          <a href="${params.invitationLink}" style="${baseStyles.button}">Pieņemt uzaicinājumu</a>
        </p>
        <div style="${baseStyles.footer}">
          <p>Uzaicinājuma saite ir derīga 7 dienas. Ja jūs nevēlaties pievienoties, varat ignorēt šo e-pastu.</p>
        </div>
      </div>
    `,
    }),
};
