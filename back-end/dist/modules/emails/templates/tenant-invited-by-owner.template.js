"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tenantInvitedByOwnerTemplates = void 0;
const email_layout_template_1 = require("./email-layout.template");
exports.tenantInvitedByOwnerTemplates = {
    en: (params) => ({
        subject: 'Invitation to manage your apartment on Domera',
        html: (0, email_layout_template_1.renderEmailLayout)({
            language: 'en',
            title: 'Your landlord invited you',
            badge: 'Tenant access',
            children: `
        ${(0, email_layout_template_1.paragraph)(`Hello${params.tenantName ? ` ${params.tenantName}` : ''}, ${params.ownerName} has invited you to join Domera.`)}
        ${(0, email_layout_template_1.detailRows)([
                { label: 'Owner', value: params.ownerName },
                { label: 'Building', value: params.buildingName },
                { label: 'Apartment', value: params.apartmentNumber },
            ])}
        ${(0, email_layout_template_1.infoBox)('What is included:', (0, email_layout_template_1.bulletList)([
                'View meter readings',
                'Receive invoices',
                'Communicate with the landlord',
                'Submit maintenance requests',
            ]))}
        ${(0, email_layout_template_1.button)('Accept invitation', params.invitationLink)}
        ${(0, email_layout_template_1.note)('The invitation link is valid for 7 days.')}
      `,
        }),
    }),
    ru: (params) => ({
        subject: 'Приглашение управлять вашей квартирой в Domera',
        html: (0, email_layout_template_1.renderEmailLayout)({
            language: 'ru',
            title: 'Вас пригласил владелец',
            badge: 'Доступ жильца',
            children: `
        ${(0, email_layout_template_1.paragraph)(`Здравствуйте${params.tenantName ? `, ${params.tenantName}` : ''}. ${params.ownerName} приглашает вас присоединиться к Domera.`)}
        ${(0, email_layout_template_1.detailRows)([
                { label: 'Владелец', value: params.ownerName },
                { label: 'Дом', value: params.buildingName },
                { label: 'Квартира', value: params.apartmentNumber },
            ])}
        ${(0, email_layout_template_1.infoBox)('Что доступно:', (0, email_layout_template_1.bulletList)([
                'Просмотр показаний счетчиков',
                'Получение счетов',
                'Связь с владельцем',
                'Подача заявок на ремонт',
            ]))}
        ${(0, email_layout_template_1.button)('Принять приглашение', params.invitationLink)}
        ${(0, email_layout_template_1.note)('Ссылка приглашения действительна 7 дней.')}
      `,
        }),
    }),
    lv: (params) => ({
        subject: 'Uzaicinājums pārvaldīt savu dzīvokli Domera',
        html: (0, email_layout_template_1.renderEmailLayout)({
            language: 'lv',
            title: 'Jūs uzaicināja īpašnieks',
            badge: 'Iedzīvotāja piekļuve',
            children: `
        ${(0, email_layout_template_1.paragraph)(`Sveiki${params.tenantName ? `, ${params.tenantName}` : ''}. ${params.ownerName} aicina jūs pievienoties Domera.`)}
        ${(0, email_layout_template_1.detailRows)([
                { label: 'Īpašnieks', value: params.ownerName },
                { label: 'Ēka', value: params.buildingName },
                { label: 'Dzīvoklis', value: params.apartmentNumber },
            ])}
        ${(0, email_layout_template_1.infoBox)('Kas ir pieejams:', (0, email_layout_template_1.bulletList)([
                'Skatīt skaitītāju rādījumus',
                'Saņemt rēķinus',
                'Sazināties ar īpašnieku',
                'Iesniegt remonta pieprasījumus',
            ]))}
        ${(0, email_layout_template_1.button)('Pieņemt uzaicinājumu', params.invitationLink)}
        ${(0, email_layout_template_1.note)('Uzaicinājuma saite ir derīga 7 dienas.')}
      `,
        }),
    }),
};
