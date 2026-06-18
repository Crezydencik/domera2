import { EmailTemplate, EmailLanguage } from '../email.types';
import { bulletList, button, detailRows, infoBox, note, paragraph, renderEmailLayout } from './email-layout.template';

export interface TenantInvitationParams {
  companyName: string;
  buildingName?: string;
  apartmentNumber?: string;
  invitationLink: string;
  senderName?: string;
}

export const tenantInvitationTemplates: Record<
  EmailLanguage,
  (params: TenantInvitationParams) => EmailTemplate
> = {
  en: (params: TenantInvitationParams) => ({
    subject: `Welcome to Domera - ${params.companyName}`,
    html: renderEmailLayout({
      language: 'en',
      title: 'You are invited to Domera',
      badge: params.companyName,
      children: `
        ${paragraph(`${params.senderName ? `${params.senderName} from ` : ''}${params.companyName} has invited you to manage your residential life in Domera.`)}
        ${detailRows([
          { label: 'Building', value: params.buildingName },
          { label: 'Apartment', value: params.apartmentNumber },
        ])}
        ${infoBox('With Domera you can:', bulletList([
          'View meter readings and utilities',
          'Receive and pay invoices online',
          'Contact building management',
          'Access important documents',
        ]))}
        ${button('Start now', params.invitationLink)}
        ${note('The invitation link is valid for 7 days.')}
      `,
    }),
  }),

  ru: (params: TenantInvitationParams) => ({
    subject: `Добро пожаловать в Domera - ${params.companyName}`,
    html: renderEmailLayout({
      language: 'ru',
      title: 'Вы приглашены в Domera',
      badge: params.companyName,
      children: `
        ${paragraph(`${params.senderName ? `${params.senderName} из ` : ''}${params.companyName} приглашает вас управлять своей жизнью в доме через Domera.`)}
        ${detailRows([
          { label: 'Дом', value: params.buildingName },
          { label: 'Квартира', value: params.apartmentNumber },
        ])}
        ${infoBox('В Domera вы можете:', bulletList([
          'Просматривать показания счетчиков и коммунальные услуги',
          'Получать и оплачивать счета онлайн',
          'Связаться с управлением дома',
          'Получить доступ к важным документам',
        ]))}
        ${button('Начать сейчас', params.invitationLink)}
        ${note('Ссылка приглашения действительна 7 дней.')}
      `,
    }),
  }),

  lv: (params: TenantInvitationParams) => ({
    subject: `Laipni lūdzam Domera - ${params.companyName}`,
    html: renderEmailLayout({
      language: 'lv',
      title: 'Jūs esat aicināts uz Domera',
      badge: params.companyName,
      children: `
        ${paragraph(`${params.senderName ? `${params.senderName} no ` : ''}${params.companyName} aicina jūs pārvaldīt dzīvi mājoklī ar Domera.`)}
        ${detailRows([
          { label: 'Ēka', value: params.buildingName },
          { label: 'Dzīvoklis', value: params.apartmentNumber },
        ])}
        ${infoBox('Ar Domera varat:', bulletList([
          'Skatīt skaitītāju rādījumus un komunālos pakalpojumus',
          'Saņemt un apmaksāt rēķinus tiešsaistē',
          'Sazināties ar mājas pārvaldi',
          'Piekļūt svarīgiem dokumentiem',
        ]))}
        ${button('Sākt tagad', params.invitationLink)}
        ${note('Uzaicinājuma saite ir derīga 7 dienas.')}
      `,
    }),
  }),
};
