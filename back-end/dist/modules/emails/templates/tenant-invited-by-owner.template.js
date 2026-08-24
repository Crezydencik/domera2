"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tenantInvitedByOwnerTemplates = void 0;
const email_layout_template_1 = require("./email-layout.template");
exports.tenantInvitedByOwnerTemplates = {
    en: (params) => ({
        subject: 'Tenant invitation to Domera',
        html: (0, email_layout_template_1.renderEmailLayout)({
            language: 'en',
            brandName: params.brandName,
            title: 'You are invited as a tenant',
            badge: 'Tenant access',
            children: `
        ${(0, email_layout_template_1.paragraph)(`Hello${params.tenantName ? ` ${params.tenantName}` : ''}, ${params.ownerName} has invited you to Domera as a tenant. Accept the invitation to access the apartment details and tenant services connected to this property.`)}
        ${(0, email_layout_template_1.detailRows)([
                { label: 'Owner', value: params.ownerName },
                { label: 'Role', value: 'Tenant' },
                { label: 'Building', value: params.buildingName },
                { label: 'Apartment', value: params.apartmentNumber },
            ])}
        ${(0, email_layout_template_1.infoBox)('Your tenant access includes:', (0, email_layout_template_1.bulletList)([
                'View meter readings',
                'Receive invoices',
                'Communicate with the landlord',
                'Submit maintenance requests',
            ]))}
        ${(0, email_layout_template_1.button)('Accept invitation', params.invitationLink)}
        ${(0, email_layout_template_1.note)('The invitation link is valid for 7 days. If you did not expect this invitation, you can safely ignore this email.')}
      `,
        }),
    }),
    ru: (params) => ({
        subject: 'Приглашение арендатора в Domera',
        html: (0, email_layout_template_1.renderEmailLayout)({
            language: 'ru',
            brandName: params.brandName,
            title: 'Вас пригласили как арендатора',
            badge: 'Доступ арендатора',
            children: `
        ${(0, email_layout_template_1.paragraph)(`Здравствуйте${params.tenantName ? `, ${params.tenantName}` : ''}. ${params.ownerName} приглашает вас в Domera в качестве арендатора. Примите приглашение, чтобы получить доступ к данным квартиры и сервисам арендатора.`)}
        ${(0, email_layout_template_1.detailRows)([
                { label: 'Владелец', value: params.ownerName },
                { label: 'Роль', value: 'Арендатор' },
                { label: 'Дом', value: params.buildingName },
                { label: 'Квартира', value: params.apartmentNumber },
            ])}
        ${(0, email_layout_template_1.infoBox)('Ваш доступ арендатора включает:', (0, email_layout_template_1.bulletList)([
                'Просмотр показаний счетчиков',
                'Получение счетов',
                'Связь с владельцем',
                'Подачу заявок на ремонт',
            ]))}
        ${(0, email_layout_template_1.button)('Принять приглашение', params.invitationLink)}
        ${(0, email_layout_template_1.note)('Ссылка приглашения действительна 7 дней. Если вы не ожидали это приглашение, письмо можно просто проигнорировать.')}
      `,
        }),
    }),
    lv: (params) => ({
        subject: 'Īrnieka uzaicinājums Domera',
        html: (0, email_layout_template_1.renderEmailLayout)({
            language: 'lv',
            brandName: params.brandName,
            title: 'Jūs esat uzaicināts kā īrnieks',
            badge: 'Īrnieka piekļuve',
            children: `
        ${(0, email_layout_template_1.paragraph)(`Sveiki${params.tenantName ? `, ${params.tenantName}` : ''}. ${params.ownerName} aicina jūs pievienoties Domera kā īrnieku. Pieņemiet uzaicinājumu, lai piekļūtu dzīvokļa informācijai un ar šo īpašumu saistītajiem īrnieka pakalpojumiem.`)}
        ${(0, email_layout_template_1.detailRows)([
                { label: 'Īpašnieks', value: params.ownerName },
                { label: 'Loma', value: 'Īrnieks' },
                { label: 'Ēka', value: params.buildingName },
                { label: 'Dzīvoklis', value: params.apartmentNumber },
            ])}
        ${(0, email_layout_template_1.infoBox)('Jūsu īrnieka piekļuvē ietilpst:', (0, email_layout_template_1.bulletList)([
                'Skaitītāju rādījumu apskate',
                'Rēķinu saņemšana',
                'Saziņa ar īpašnieku',
                'Remonta pieteikumu iesniegšana',
            ]))}
        ${(0, email_layout_template_1.button)('Pieņemt uzaicinājumu', params.invitationLink)}
        ${(0, email_layout_template_1.note)('Uzaicinājuma saite ir derīga 7 dienas. Ja negaidījāt šo uzaicinājumu, varat droši ignorēt šo e-pastu.')}
      `,
        }),
    }),
};
