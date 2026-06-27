"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tenantInvitationTemplates = void 0;
const email_layout_template_1 = require("./email-layout.template");
exports.tenantInvitationTemplates = {
    en: (params) => ({
        subject: `Tenant invitation to Domera - ${params.companyName}`,
        html: (0, email_layout_template_1.renderEmailLayout)({
            language: 'en',
            title: 'You are invited as a tenant',
            badge: 'Tenant access',
            children: `
        ${(0, email_layout_template_1.paragraph)(`${params.senderName ? `${params.senderName} from ` : ''}${params.companyName} has invited you to Domera as a tenant. After accepting the invitation, you will get access to your apartment information and tenant services in one place.`)}
        ${(0, email_layout_template_1.detailRows)([
                { label: 'Company', value: params.companyName },
                { label: 'Role', value: 'Tenant' },
                { label: 'Building', value: params.buildingName },
                { label: 'Apartment', value: params.apartmentNumber },
            ])}
        ${(0, email_layout_template_1.infoBox)('Your tenant access includes:', (0, email_layout_template_1.bulletList)([
                'View meter readings and utilities',
                'Receive and pay invoices online',
                'Contact building management',
                'Access important documents',
            ]))}
        ${(0, email_layout_template_1.button)('Accept invitation', params.invitationLink)}
        ${(0, email_layout_template_1.note)('The invitation link is valid for 7 days. If you did not expect this invitation, you can safely ignore this email.')}
      `,
        }),
    }),
    ru: (params) => ({
        subject: `Приглашение арендатора в Domera - ${params.companyName}`,
        html: (0, email_layout_template_1.renderEmailLayout)({
            language: 'ru',
            title: 'Вас пригласили как арендатора',
            badge: 'Доступ арендатора',
            children: `
        ${(0, email_layout_template_1.paragraph)(`${params.senderName ? `${params.senderName} из ` : ''}${params.companyName} приглашает вас в Domera в качестве арендатора. После принятия приглашения вы получите доступ к информации по квартире и сервисам для арендатора.`)}
        ${(0, email_layout_template_1.detailRows)([
                { label: 'Компания', value: params.companyName },
                { label: 'Роль', value: 'Арендатор' },
                { label: 'Дом', value: params.buildingName },
                { label: 'Квартира', value: params.apartmentNumber },
            ])}
        ${(0, email_layout_template_1.infoBox)('Ваш доступ арендатора включает:', (0, email_layout_template_1.bulletList)([
                'Просмотр показаний счетчиков и коммунальных услуг',
                'Получение и оплату счетов онлайн',
                'Связь с управляющей компанией',
                'Доступ к важным документам',
            ]))}
        ${(0, email_layout_template_1.button)('Принять приглашение', params.invitationLink)}
        ${(0, email_layout_template_1.note)('Ссылка приглашения действительна 7 дней. Если вы не ожидали это приглашение, письмо можно просто проигнорировать.')}
      `,
        }),
    }),
    lv: (params) => ({
        subject: `Īrnieka uzaicinājums Domera - ${params.companyName}`,
        html: (0, email_layout_template_1.renderEmailLayout)({
            language: 'lv',
            title: 'Jūs esat uzaicināts kā īrnieks',
            badge: 'Īrnieka piekļuve',
            children: `
        ${(0, email_layout_template_1.paragraph)(`${params.senderName ? `${params.senderName} no ` : ''}${params.companyName} aicina jūs pievienoties Domera kā īrnieku. Pēc uzaicinājuma pieņemšanas jums būs piekļuve dzīvokļa informācijai un īrnieka pakalpojumiem vienuviet.`)}
        ${(0, email_layout_template_1.detailRows)([
                { label: 'Uzņēmums', value: params.companyName },
                { label: 'Loma', value: 'Īrnieks' },
                { label: 'Ēka', value: params.buildingName },
                { label: 'Dzīvoklis', value: params.apartmentNumber },
            ])}
        ${(0, email_layout_template_1.infoBox)('Jūsu īrnieka piekļuvē ietilpst:', (0, email_layout_template_1.bulletList)([
                'Skaitītāju rādījumu un komunālo pakalpojumu apskate',
                'Rēķinu saņemšana un apmaksa tiešsaistē',
                'Saziņa ar mājas pārvaldnieku',
                'Piekļuve svarīgiem dokumentiem',
            ]))}
        ${(0, email_layout_template_1.button)('Pieņemt uzaicinājumu', params.invitationLink)}
        ${(0, email_layout_template_1.note)('Uzaicinājuma saite ir derīga 7 dienas. Ja negaidījāt šo uzaicinājumu, varat droši ignorēt šo e-pastu.')}
      `,
        }),
    }),
};
