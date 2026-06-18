"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tenantInvitationTemplates = void 0;
const email_layout_template_1 = require("./email-layout.template");
exports.tenantInvitationTemplates = {
    en: (params) => ({
        subject: `Welcome to Domera - ${params.companyName}`,
        html: (0, email_layout_template_1.renderEmailLayout)({
            language: 'en',
            title: 'You are invited to Domera',
            badge: params.companyName,
            children: `
        ${(0, email_layout_template_1.paragraph)(`${params.senderName ? `${params.senderName} from ` : ''}${params.companyName} has invited you to manage your residential life in Domera.`)}
        ${(0, email_layout_template_1.detailRows)([
                { label: 'Building', value: params.buildingName },
                { label: 'Apartment', value: params.apartmentNumber },
            ])}
        ${(0, email_layout_template_1.infoBox)('With Domera you can:', (0, email_layout_template_1.bulletList)([
                'View meter readings and utilities',
                'Receive and pay invoices online',
                'Contact building management',
                'Access important documents',
            ]))}
        ${(0, email_layout_template_1.button)('Start now', params.invitationLink)}
        ${(0, email_layout_template_1.note)('The invitation link is valid for 7 days.')}
      `,
        }),
    }),
    ru: (params) => ({
        subject: `Добро пожаловать в Domera - ${params.companyName}`,
        html: (0, email_layout_template_1.renderEmailLayout)({
            language: 'ru',
            title: 'Вы приглашены в Domera',
            badge: params.companyName,
            children: `
        ${(0, email_layout_template_1.paragraph)(`${params.senderName ? `${params.senderName} из ` : ''}${params.companyName} приглашает вас управлять своей жизнью в доме через Domera.`)}
        ${(0, email_layout_template_1.detailRows)([
                { label: 'Дом', value: params.buildingName },
                { label: 'Квартира', value: params.apartmentNumber },
            ])}
        ${(0, email_layout_template_1.infoBox)('В Domera вы можете:', (0, email_layout_template_1.bulletList)([
                'Просматривать показания счетчиков и коммунальные услуги',
                'Получать и оплачивать счета онлайн',
                'Связаться с управлением дома',
                'Получить доступ к важным документам',
            ]))}
        ${(0, email_layout_template_1.button)('Начать сейчас', params.invitationLink)}
        ${(0, email_layout_template_1.note)('Ссылка приглашения действительна 7 дней.')}
      `,
        }),
    }),
    lv: (params) => ({
        subject: `Laipni lūdzam Domera - ${params.companyName}`,
        html: (0, email_layout_template_1.renderEmailLayout)({
            language: 'lv',
            title: 'Jūs esat aicināts uz Domera',
            badge: params.companyName,
            children: `
        ${(0, email_layout_template_1.paragraph)(`${params.senderName ? `${params.senderName} no ` : ''}${params.companyName} aicina jūs pārvaldīt dzīvi mājoklī ar Domera.`)}
        ${(0, email_layout_template_1.detailRows)([
                { label: 'Ēka', value: params.buildingName },
                { label: 'Dzīvoklis', value: params.apartmentNumber },
            ])}
        ${(0, email_layout_template_1.infoBox)('Ar Domera varat:', (0, email_layout_template_1.bulletList)([
                'Skatīt skaitītāju rādījumus un komunālos pakalpojumus',
                'Saņemt un apmaksāt rēķinus tiešsaistē',
                'Sazināties ar mājas pārvaldi',
                'Piekļūt svarīgiem dokumentiem',
            ]))}
        ${(0, email_layout_template_1.button)('Sākt tagad', params.invitationLink)}
        ${(0, email_layout_template_1.note)('Uzaicinājuma saite ir derīga 7 dienas.')}
      `,
        }),
    }),
};
