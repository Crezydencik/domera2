import { EmailTemplate, EmailLanguage } from '../email.types';
import { button, detailRows, note, paragraph, renderEmailLayout } from './email-layout.template';

export interface OwnerInvitationParams {
  companyName: string;
  brandName?: string;
  ownerName?: string;
  ownerEmail?: string;
  invitationLink: string;
  buildingName?: string;
  apartmentNumber?: string;
}

function locationLine(params: OwnerInvitationParams, language: EmailLanguage): string {
  const building = params.buildingName?.trim();
  const apartment = params.apartmentNumber?.trim();

  if (language === 'ru') {
    return [
      'Приглашаем вас присоединиться к жилью в Domera',
      building ? `по адресу ${building}` : '',
      apartment ? `квартира ${apartment}` : '',
    ].filter(Boolean).join(', ') + '.';
  }

  if (language === 'lv') {
    return [
      'Jūs esat aicināts pievienoties Domera',
      building ? `ēkai pēc adreses ${building}` : '',
      apartment ? `dzīvoklim ${apartment}` : '',
    ].filter(Boolean).join(' ') + '.';
  }

  return [
    'You are invited to join Domera',
    building ? `for the building at ${building}` : '',
    apartment ? `apartment ${apartment}` : '',
  ].filter(Boolean).join(', ') + '.';
}

export const ownerInvitationTemplates: Record<
  EmailLanguage,
  (params: OwnerInvitationParams) => EmailTemplate
> = {
  en: (params: OwnerInvitationParams) => ({
    subject: `Join ${params.companyName} on Domera`,
    html: renderEmailLayout({
      language: 'en',
      brandName: params.brandName || params.companyName,
      title: 'Property owner invitation',
      badge: params.companyName,
      children: `
        ${paragraph(locationLine(params, 'en'))}
        ${detailRows([
          { label: 'Owner', value: params.ownerName },
          { label: 'E-mail', value: params.ownerEmail },
          { label: 'Building', value: params.buildingName },
          { label: 'Apartment', value: params.apartmentNumber },
        ])}
        ${button('Accept invitation', params.invitationLink)}
        ${note('The invitation link is valid for 7 days. If you did not expect this invitation, you can safely ignore this email.')}
      `,
    }),
  }),

  ru: (params: OwnerInvitationParams) => ({
    subject: `Присоединитесь к Domera`,
    html: renderEmailLayout({
      language: 'ru',
      brandName: params.brandName || params.companyName,
      title: 'Приглашение собственника',
      badge: params.companyName,
      children: `
        ${paragraph(locationLine(params, 'ru'))}
        ${detailRows([
          { label: 'Владелец', value: params.ownerName },
          { label: 'E-mail', value: params.ownerEmail },
          { label: 'Дом', value: params.buildingName },
          { label: 'Квартира', value: params.apartmentNumber },
        ])}
        ${button('Принять приглашение', params.invitationLink)}
        ${note('Ссылка приглашения действительна 7 дней. Если вы не ожидали это приглашение, письмо можно просто проигнорировать.')}
      `,
    }),
  }),

  lv: (params: OwnerInvitationParams) => ({
    subject: `Pievienojieties Domera`,
    html: renderEmailLayout({
      language: 'lv',
      brandName: params.brandName || params.companyName,
      title: 'Īpašnieka uzaicinājums',
      badge: params.companyName,
      children: `
        ${paragraph(locationLine(params, 'lv'))}
        ${detailRows([
          { label: 'Īpašnieks', value: params.ownerName },
          { label: 'E-pasts', value: params.ownerEmail },
          { label: 'Ēka', value: params.buildingName },
          { label: 'Dzīvoklis', value: params.apartmentNumber },
        ])}
        ${button('Pieņemt uzaicinājumu', params.invitationLink)}
        ${note('Uzaicinājuma saite ir derīga 7 dienas. Ja negaidījāt šo uzaicinājumu, varat droši ignorēt šo e-pastu.')}
      `,
    }),
  }),
};
