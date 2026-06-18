"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.invoiceGeneratedTemplates = void 0;
const email_layout_template_1 = require("./email-layout.template");
exports.invoiceGeneratedTemplates = {
    en: (params) => ({
        subject: `Invoice ${params.invoiceNumber} is ready - Domera`,
        html: (0, email_layout_template_1.renderEmailLayout)({
            language: 'en',
            title: `Invoice ${params.invoiceNumber}`,
            badge: params.buildingName || 'Domera',
            children: `
        ${(0, email_layout_template_1.paragraph)(`${params.tenantName ? `Hello, <strong>${params.tenantName}</strong>. ` : ''}Your invoice for services is ready.`)}
        ${(0, email_layout_template_1.detailRows)([
                { label: 'Amount', value: params.amount },
                { label: 'Invoice number', value: params.invoiceNumber },
                { label: 'Due date', value: params.dueDate || '-' },
                { label: 'Apartment', value: params.apartmentNumber },
            ])}
        ${(0, email_layout_template_1.button)('View invoice', params.invoiceLink)}
        ${(0, email_layout_template_1.note)('The invoice is attached to this email. Detailed invoice information is available by the button above.')}
      `,
        }),
    }),
    ru: (params) => ({
        subject: `Счёт ${params.invoiceNumber} готов - Domera`,
        html: (0, email_layout_template_1.renderEmailLayout)({
            language: 'ru',
            title: `Счёт ${params.invoiceNumber}`,
            badge: params.buildingName || 'Domera',
            children: `
        ${(0, email_layout_template_1.paragraph)(`${params.tenantName ? `Здравствуйте, <strong>${params.tenantName}</strong>. ` : ''}Ваш счёт за услуги готов.`)}
        ${(0, email_layout_template_1.detailRows)([
                { label: 'Сумма', value: params.amount },
                { label: 'Номер счёта', value: params.invoiceNumber },
                { label: 'Срок оплаты', value: params.dueDate || '-' },
                { label: 'Квартира', value: params.apartmentNumber },
            ])}
        ${(0, email_layout_template_1.button)('Посмотреть счёт', params.invoiceLink)}
        ${(0, email_layout_template_1.note)('Счёт прикреплён к этому письму. Детальная информация доступна по кнопке выше.')}
      `,
        }),
    }),
    lv: (params) => ({
        subject: `Rēķins ${params.invoiceNumber} ir gatavs - Domera`,
        html: (0, email_layout_template_1.renderEmailLayout)({
            language: 'lv',
            title: `Rēķins ${params.invoiceNumber}`,
            badge: params.buildingName || 'Domera',
            children: `
        ${(0, email_layout_template_1.paragraph)(`${params.tenantName ? `Sveiki, <strong>${params.tenantName}</strong>. ` : ''}Jūsu rēķins par pakalpojumiem ir sagatavots.`)}
        ${(0, email_layout_template_1.detailRows)([
                { label: 'Summa', value: params.amount },
                { label: 'Rēķina numurs', value: params.invoiceNumber },
                { label: 'Apmaksas termiņš', value: params.dueDate || '-' },
                { label: 'Dzīvoklis', value: params.apartmentNumber },
            ])}
        ${(0, email_layout_template_1.button)('Skatīt rēķinu', params.invoiceLink)}
        ${(0, email_layout_template_1.note)('Rēķins ir pievienots šim e-pastam. Detalizēta rēķina informācija ir pieejama ar pogu augstāk.')}
      `,
        }),
    }),
};
