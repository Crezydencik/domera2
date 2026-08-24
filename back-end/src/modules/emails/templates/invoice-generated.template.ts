import { EmailLanguage, EmailTemplate } from '../email.types';
import { button, detailRows, note, paragraph, renderEmailLayout } from './email-layout.template';

export interface InvoiceGeneratedParams {
  tenantName?: string;
  brandName?: string;
  apartmentNumber?: string;
  buildingName?: string;
  invoiceNumber: string;
  amount: string;
  dueDate: string;
  invoiceLink: string;
}

export const invoiceGeneratedTemplates: Record<
  EmailLanguage,
  (params: InvoiceGeneratedParams) => EmailTemplate
> = {
  en: (params: InvoiceGeneratedParams) => ({
    subject: `Invoice ${params.invoiceNumber} is ready - Domera`,
    html: renderEmailLayout({
      language: 'en',
      brandName: params.brandName,
      title: `Invoice ${params.invoiceNumber}`,
      badge: params.buildingName || 'Domera',
      children: `
        ${paragraph(`${params.tenantName ? `Hello, <strong>${params.tenantName}</strong>. ` : ''}Your invoice for services is ready.`)}
        ${detailRows([
          { label: 'Amount', value: params.amount },
          { label: 'Invoice number', value: params.invoiceNumber },
          { label: 'Due date', value: params.dueDate || '-' },
          { label: 'Apartment', value: params.apartmentNumber },
        ])}
        ${button('View invoice', params.invoiceLink)}
        ${note('The invoice is attached to this email. Detailed invoice information is available by the button above.')}
      `,
    }),
  }),

  ru: (params: InvoiceGeneratedParams) => ({
    subject: `Счёт ${params.invoiceNumber} готов - Domera`,
    html: renderEmailLayout({
      language: 'ru',
      brandName: params.brandName,
      title: `Счёт ${params.invoiceNumber}`,
      badge: params.buildingName || 'Domera',
      children: `
        ${paragraph(`${params.tenantName ? `Здравствуйте, <strong>${params.tenantName}</strong>. ` : ''}Ваш счёт за услуги готов.`)}
        ${detailRows([
          { label: 'Сумма', value: params.amount },
          { label: 'Номер счёта', value: params.invoiceNumber },
          { label: 'Срок оплаты', value: params.dueDate || '-' },
          { label: 'Квартира', value: params.apartmentNumber },
        ])}
        ${button('Посмотреть счёт', params.invoiceLink)}
        ${note('Счёт прикреплён к этому письму. Детальная информация доступна по кнопке выше.')}
      `,
    }),
  }),

  lv: (params: InvoiceGeneratedParams) => ({
    subject: `Rēķins ${params.invoiceNumber} ir gatavs - Domera`,
    html: renderEmailLayout({
      language: 'lv',
      brandName: params.brandName,
      title: `Rēķins ${params.invoiceNumber}`,
      badge: params.buildingName || 'Domera',
      children: `
        ${paragraph(`${params.tenantName ? `Sveiki, <strong>${params.tenantName}</strong>. ` : ''}Jūsu rēķins par pakalpojumiem ir sagatavots.`)}
        ${detailRows([
          { label: 'Summa', value: params.amount },
          { label: 'Rēķina numurs', value: params.invoiceNumber },
          { label: 'Apmaksas termiņš', value: params.dueDate || '-' },
          { label: 'Dzīvoklis', value: params.apartmentNumber },
        ])}
        ${button('Skatīt rēķinu', params.invoiceLink)}
        ${note('Rēķins ir pievienots šim e-pastam. Detalizēta rēķina informācija ir pieejama ar pogu augstāk.')}
      `,
    }),
  }),
};
