import { EmailTemplate, EmailLanguage } from '../email.types';
export interface MeterReadingReminderParams {
    tenantName?: string;
    apartmentNumber?: string;
    buildingName?: string;
    meters: Array<{
        name: string;
        lastReading?: string;
        unit?: string;
    }>;
    submissionLink: string;
    deadline?: string;
}
export declare const meterReadingReminderTemplates: Record<EmailLanguage, (params: MeterReadingReminderParams) => EmailTemplate>;
