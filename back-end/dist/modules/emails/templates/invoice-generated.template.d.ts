import { EmailTemplate, EmailLanguage } from '../email.types';
export interface InvoiceGeneratedParams {
    tenantName?: string;
    apartmentNumber?: string;
    buildingName?: string;
    invoiceNumber: string;
    amount: string;
    dueDate: string;
    invoiceLink: string;
}
export declare const invoiceGeneratedTemplates: Record<EmailLanguage, (params: InvoiceGeneratedParams) => EmailTemplate>;
