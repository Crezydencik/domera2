import { EmailTemplate, EmailLanguage } from '../email.types';
import { bulletList, button, detailRows, infoBox, note, paragraph, renderEmailLayout } from './email-layout.template';

export interface TenantInvitedByOwnerParams {
  tenantName?: string;
  brandName?: string;
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
    subject: 'Tenant invitation to Domera',
    html: renderEmailLayout({
      language: 'en',
      brandName: params.brandName,
      title: 'You are invited as a tenant',
      badge: 'Tenant access',
      children: `
        ${paragraph(`Hello${params.tenantName ? ` ${params.tenantName}` : ''}, ${params.ownerName} has invited you to Domera as a tenant. Accept the invitation to access the apartment details and tenant services connected to this property.`)}
        ${detailRows([
          { label: 'Owner', value: params.ownerName },
          { label: 'Role', value: 'Tenant' },
          { label: 'Building', value: params.buildingName },
          { label: 'Apartment', value: params.apartmentNumber },
        ])}
        ${infoBox('Your tenant access includes:', bulletList([
          'View meter readings',
          'Receive invoices',
          'Communicate with the landlord',
          'Submit maintenance requests',
        ]))}
        ${button('Accept invitation', params.invitationLink)}
        ${note('The invitation link is valid for 7 days. If you did not expect this invitation, you can safely ignore this email.')}
      `,
    }),
  }),

  ru: (params: TenantInvitedByOwnerParams) => ({
    subject: 'Приглашение арендатора в Domera',
    html: renderEmailLayout({
      language: 'ru',
      brandName: params.brandName,
      title: 'Вас пригласили как арендатора',
      badge: 'Доступ арендатора',
      children: `
        ${paragraph(`Здравствуйте${params.tenantName ? `, ${params.tenantName}` : ''}. ${params.ownerName} приглашает вас в Domera в качестве арендатора. Примите приглашение, чтобы получить доступ к данным квартиры и сервисам арендатора.`)}
        ${detailRows([
          { label: 'Владелец', value: params.ownerName },
          { label: 'Роль', value: 'Арендатор' },
          { label: 'Дом', value: params.buildingName },
          { label: 'Квартира', value: params.apartmentNumber },
        ])}
        ${infoBox('Ваш доступ арендатора включает:', bulletList([
          'Просмотр показаний счетчиков',
          'Получение счетов',
          'Связь с владельцем',
          'Подачу заявок на ремонт',
        ]))}
        ${button('Принять приглашение', params.invitationLink)}
        ${note('Ссылка приглашения действительна 7 дней. Если вы не ожидали это приглашение, письмо можно просто проигнорировать.')}
      `,
    }),
  }),

  lv: (params: TenantInvitedByOwnerParams) => ({
    subject: 'Īrnieka uzaicinājums Domera',
    html: renderEmailLayout({
      language: 'lv',
      brandName: params.brandName,
      title: 'Jūs esat uzaicināts kā īrnieks',
      badge: 'Īrnieka piekļuve',
      children: `
        ${paragraph(`Sveiki${params.tenantName ? `, ${params.tenantName}` : ''}. ${params.ownerName} aicina jūs pievienoties Domera kā īrnieku. Pieņemiet uzaicinājumu, lai piekļūtu dzīvokļa informācijai un ar šo īpašumu saistītajiem īrnieka pakalpojumiem.`)}
        ${detailRows([
          { label: 'Īpašnieks', value: params.ownerName },
          { label: 'Loma', value: 'Īrnieks' },
          { label: 'Ēka', value: params.buildingName },
          { label: 'Dzīvoklis', value: params.apartmentNumber },
        ])}
        ${infoBox('Jūsu īrnieka piekļuvē ietilpst:', bulletList([
          'Skaitītāju rādījumu apskate',
          'Rēķinu saņemšana',
          'Saziņa ar īpašnieku',
          'Remonta pieteikumu iesniegšana',
        ]))}
        ${button('Pieņemt uzaicinājumu', params.invitationLink)}
        ${note('Uzaicinājuma saite ir derīga 7 dienas. Ja negaidījāt šo uzaicinājumu, varat droši ignorēt šo e-pastu.')}
      `,
    }),
  }),
};
