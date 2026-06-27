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
    subject: `Tenant invitation to Domera - ${params.companyName}`,
    html: renderEmailLayout({
      language: 'en',
      title: 'You are invited as a tenant',
      badge: 'Tenant access',
      children: `
        ${paragraph(`${params.senderName ? `${params.senderName} from ` : ''}${params.companyName} has invited you to Domera as a tenant. After accepting the invitation, you will get access to your apartment information and tenant services in one place.`)}
        ${detailRows([
          { label: 'Company', value: params.companyName },
          { label: 'Role', value: 'Tenant' },
          { label: 'Building', value: params.buildingName },
          { label: 'Apartment', value: params.apartmentNumber },
        ])}
        ${infoBox('Your tenant access includes:', bulletList([
          'View meter readings and utilities',
          'Receive and pay invoices online',
          'Contact building management',
          'Access important documents',
        ]))}
        ${button('Accept invitation', params.invitationLink)}
        ${note('The invitation link is valid for 7 days. If you did not expect this invitation, you can safely ignore this email.')}
      `,
    }),
  }),

  ru: (params: TenantInvitationParams) => ({
    subject: `Приглашение арендатора в Domera - ${params.companyName}`,
    html: renderEmailLayout({
      language: 'ru',
      title: 'Вас пригласили как арендатора',
      badge: 'Доступ арендатора',
      children: `
        ${paragraph(`${params.senderName ? `${params.senderName} из ` : ''}${params.companyName} приглашает вас в Domera в качестве арендатора. После принятия приглашения вы получите доступ к информации по квартире и сервисам для арендатора.`)}
        ${detailRows([
          { label: 'Компания', value: params.companyName },
          { label: 'Роль', value: 'Арендатор' },
          { label: 'Дом', value: params.buildingName },
          { label: 'Квартира', value: params.apartmentNumber },
        ])}
        ${infoBox('Ваш доступ арендатора включает:', bulletList([
          'Просмотр показаний счетчиков и коммунальных услуг',
          'Получение и оплату счетов онлайн',
          'Связь с управляющей компанией',
          'Доступ к важным документам',
        ]))}
        ${button('Принять приглашение', params.invitationLink)}
        ${note('Ссылка приглашения действительна 7 дней. Если вы не ожидали это приглашение, письмо можно просто проигнорировать.')}
      `,
    }),
  }),

  lv: (params: TenantInvitationParams) => ({
    subject: `Īrnieka uzaicinājums Domera - ${params.companyName}`,
    html: renderEmailLayout({
      language: 'lv',
      title: 'Jūs esat uzaicināts kā īrnieks',
      badge: 'Īrnieka piekļuve',
      children: `
        ${paragraph(`${params.senderName ? `${params.senderName} no ` : ''}${params.companyName} aicina jūs pievienoties Domera kā īrnieku. Pēc uzaicinājuma pieņemšanas jums būs piekļuve dzīvokļa informācijai un īrnieka pakalpojumiem vienuviet.`)}
        ${detailRows([
          { label: 'Uzņēmums', value: params.companyName },
          { label: 'Loma', value: 'Īrnieks' },
          { label: 'Ēka', value: params.buildingName },
          { label: 'Dzīvoklis', value: params.apartmentNumber },
        ])}
        ${infoBox('Jūsu īrnieka piekļuvē ietilpst:', bulletList([
          'Skaitītāju rādījumu un komunālo pakalpojumu apskate',
          'Rēķinu saņemšana un apmaksa tiešsaistē',
          'Saziņa ar mājas pārvaldnieku',
          'Piekļuve svarīgiem dokumentiem',
        ]))}
        ${button('Pieņemt uzaicinājumu', params.invitationLink)}
        ${note('Uzaicinājuma saite ir derīga 7 dienas. Ja negaidījāt šo uzaicinājumu, varat droši ignorēt šo e-pastu.')}
      `,
    }),
  }),
};
