"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ownerInvitationTemplates = void 0;
const email_layout_template_1 = require("./email-layout.template");
function locationLine(params, language) {
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
exports.ownerInvitationTemplates = {
    en: (params) => ({
        subject: `Join ${params.companyName} on Domera`,
        html: (0, email_layout_template_1.renderEmailLayout)({
            language: 'en',
            brandName: params.brandName || params.companyName,
            title: 'Property owner invitation',
            badge: params.companyName,
            children: `
        ${(0, email_layout_template_1.paragraph)(locationLine(params, 'en'))}
        ${(0, email_layout_template_1.detailRows)([
                { label: 'Owner', value: params.ownerName },
                { label: 'E-mail', value: params.ownerEmail },
                { label: 'Building', value: params.buildingName },
                { label: 'Apartment', value: params.apartmentNumber },
            ])}
        ${(0, email_layout_template_1.button)('Accept invitation', params.invitationLink)}
        ${(0, email_layout_template_1.note)('The invitation link is valid for 7 days. If you did not expect this invitation, you can safely ignore this email.')}
      `,
        }),
    }),
    ru: (params) => ({
        subject: `Присоединитесь к Domera`,
        html: (0, email_layout_template_1.renderEmailLayout)({
            language: 'ru',
            brandName: params.brandName || params.companyName,
            title: 'Приглашение собственника',
            badge: params.companyName,
            children: `
        ${(0, email_layout_template_1.paragraph)(locationLine(params, 'ru'))}
        ${(0, email_layout_template_1.detailRows)([
                { label: 'Владелец', value: params.ownerName },
                { label: 'E-mail', value: params.ownerEmail },
                { label: 'Дом', value: params.buildingName },
                { label: 'Квартира', value: params.apartmentNumber },
            ])}
        ${(0, email_layout_template_1.button)('Принять приглашение', params.invitationLink)}
        ${(0, email_layout_template_1.note)('Ссылка приглашения действительна 7 дней. Если вы не ожидали это приглашение, письмо можно просто проигнорировать.')}
      `,
        }),
    }),
    lv: (params) => ({
        subject: `Pievienojieties Domera`,
        html: (0, email_layout_template_1.renderEmailLayout)({
            language: 'lv',
            brandName: params.brandName || params.companyName,
            title: 'Īpašnieka uzaicinājums',
            badge: params.companyName,
            children: `
        ${(0, email_layout_template_1.paragraph)(locationLine(params, 'lv'))}
        ${(0, email_layout_template_1.detailRows)([
                { label: 'Īpašnieks', value: params.ownerName },
                { label: 'E-pasts', value: params.ownerEmail },
                { label: 'Ēka', value: params.buildingName },
                { label: 'Dzīvoklis', value: params.apartmentNumber },
            ])}
        ${(0, email_layout_template_1.button)('Pieņemt uzaicinājumu', params.invitationLink)}
        ${(0, email_layout_template_1.note)('Uzaicinājuma saite ir derīga 7 dienas. Ja negaidījāt šo uzaicinājumu, varat droši ignorēt šo e-pastu.')}
      `,
        }),
    }),
};
