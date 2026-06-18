import { EmailTemplate, EmailLanguage } from '../email.types';
import { bulletList, button, detailRows, infoBox, note, paragraph, renderEmailLayout } from './email-layout.template';

export interface TenantInvitedByOwnerParams {
  tenantName?: string;
  ownerName: string;
  buildingName?: string;
  apartmentNumber?: string;
  invitationLink: string;
}

export const tenantInvitedByOwnerTemplates: Record<
  EmailLanguage,
  (params: TenantInvitedByOwnerParams) => EmailTemplate
> = {
  en: (params: TenantInvitedByOwnerParams) => ({
    subject: 'Invitation to manage your apartment on Domera',
    html: renderEmailLayout({
      language: 'en',
      title: 'Your landlord invited you',
      badge: 'Tenant access',
      children: `
        ${paragraph(`Hello${params.tenantName ? ` ${params.tenantName}` : ''}, ${params.ownerName} has invited you to join Domera.`)}
        ${detailRows([
          { label: 'Owner', value: params.ownerName },
          { label: 'Building', value: params.buildingName },
          { label: 'Apartment', value: params.apartmentNumber },
        ])}
        ${infoBox('What is included:', bulletList([
          'View meter readings',
          'Receive invoices',
          'Communicate with the landlord',
          'Submit maintenance requests',
        ]))}
        ${button('Accept invitation', params.invitationLink)}
        ${note('The invitation link is valid for 7 days.')}
      `,
    }),
  }),

  ru: (params: TenantInvitedByOwnerParams) => ({
    subject: 'Приглашение управлять вашей квартирой в Domera',
    html: renderEmailLayout({
      language: 'ru',
      title: 'Вас пригласил владелец',
      badge: 'Доступ жильца',
      children: `
        ${paragraph(`Здравствуйте${params.tenantName ? `, ${params.tenantName}` : ''}. ${params.ownerName} приглашает вас присоединиться к Domera.`)}
        ${detailRows([
          { label: 'Владелец', value: params.ownerName },
          { label: 'Дом', value: params.buildingName },
          { label: 'Квартира', value: params.apartmentNumber },
        ])}
        ${infoBox('Что доступно:', bulletList([
          'Просмотр показаний счетчиков',
          'Получение счетов',
          'Связь с владельцем',
          'Подача заявок на ремонт',
        ]))}
        ${button('Принять приглашение', params.invitationLink)}
        ${note('Ссылка приглашения действительна 7 дней.')}
      `,
    }),
  }),

  lv: (params: TenantInvitedByOwnerParams) => ({
    subject: 'Uzaicinājums pārvaldīt savu dzīvokli Domera',
    html: renderEmailLayout({
      language: 'lv',
      title: 'Jūs uzaicināja īpašnieks',
      badge: 'Iedzīvotāja piekļuve',
      children: `
        ${paragraph(`Sveiki${params.tenantName ? `, ${params.tenantName}` : ''}. ${params.ownerName} aicina jūs pievienoties Domera.`)}
        ${detailRows([
          { label: 'Īpašnieks', value: params.ownerName },
          { label: 'Ēka', value: params.buildingName },
          { label: 'Dzīvoklis', value: params.apartmentNumber },
        ])}
        ${infoBox('Kas ir pieejams:', bulletList([
          'Skatīt skaitītāju rādījumus',
          'Saņemt rēķinus',
          'Sazināties ar īpašnieku',
          'Iesniegt remonta pieprasījumus',
        ]))}
        ${button('Pieņemt uzaicinājumu', params.invitationLink)}
        ${note('Uzaicinājuma saite ir derīga 7 dienas.')}
      `,
    }),
  }),
};
