import { EmailLanguage, EmailTemplate } from '../email.types';
import { button, detailRows, headerIdentity, note, paragraph, renderEmailLayout } from './email-layout.template';

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
    subject: `Invoice ${params.invoiceNumber} is ready - ${params.brandName || 'Domera'}`,
    html: renderEmailLayout({
      language: 'en',
      brandName: params.brandName,
      title: `Invoice ${params.invoiceNumber}`,
      badge: headerIdentity(params.brandName) || 'Domera',
      children: `
        ${paragraph(`${params.tenantName ? `Hello, <strong>${params.tenantName}</strong>.<br />` : ''}Your invoice for services is ready.`, 'center')}
        ${detailRows([
          { label: 'Amount', value: params.amount },
          { label: 'Invoice number', value: params.invoiceNumber },
          { label: 'Due date', value: params.dueDate || '-' },
          { label: 'Apartment', value: params.apartmentNumber },
          { label: 'Address', value: params.buildingName },
        ])}
        ${button('View invoice', params.invoiceLink)}
        ${note('The invoice is attached to this email. Detailed invoice information is available by the button above.')}
      `,
    }),
  }),

  ru: (params: InvoiceGeneratedParams) => ({
    subject: `Счёт ${params.invoiceNumber} готов - ${params.brandName || 'Domera'}`,
    html: renderEmailLayout({
      language: 'ru',
      brandName: params.brandName,
      title: `Счёт ${params.invoiceNumber}`,
      badge: headerIdentity(params.brandName) || 'Domera',
      children: `
        ${paragraph(`${params.tenantName ? `Здравствуйте, <strong>${params.tenantName}</strong>.<br />` : ''}Ваш счёт за услуги готов.`, 'center')}
        ${detailRows([
          { label: 'Сумма', value: params.amount },
          { label: 'Номер счёта', value: params.invoiceNumber },
          { label: 'Срок оплаты', value: params.dueDate || '-' },
          { label: 'Квартира', value: params.apartmentNumber },
          { label: 'Адрес', value: params.buildingName },
        ])}
        ${button('Посмотреть счёт', params.invoiceLink)}
        ${note('Счёт прикреплён к этому письму. Детальная информация доступна по кнопке выше.')}
      `,
    }),
  }),

  lv: (params: InvoiceGeneratedParams) => ({
    subject: `Rēķins ${params.invoiceNumber} ir gatavs - ${params.brandName || 'Domera'}`,
    html: renderEmailLayout({
      language: 'lv',
      brandName: params.brandName,
      title: `Rēķins ${params.invoiceNumber}`,
      badge: headerIdentity(params.brandName) || 'Domera',
      children: `
        ${paragraph(`${params.tenantName ? `Sveiki, <strong>${params.tenantName}</strong>.<br />` : ''}Jūsu rēķins par pakalpojumiem ir sagatavots.`, 'center')}
        ${detailRows([
          { label: 'Summa', value: params.amount },
          { label: 'Rēķina numurs', value: params.invoiceNumber },
          { label: 'Apmaksas termiņš', value: params.dueDate || '-' },
          { label: 'Dzīvoklis', value: params.apartmentNumber },
          { label: 'Adrese', value: params.buildingName },
        ])}
        ${button('Skatīt rēķinu', params.invoiceLink)}
        ${note('Rēķins ir pievienots šim e-pastam. Detalizēta rēķina informācija ir pieejama ar pogu augstāk.')}
      `,
    }),
  }),
};
