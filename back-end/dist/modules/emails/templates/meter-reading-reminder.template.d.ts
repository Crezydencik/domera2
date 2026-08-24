import { EmailTemplate, EmailLanguage } from '../email.types';
export interface MeterReadingReminderParams {
    tenantName?: string;
    brandName?: string;
    apartmentNumber?: string;
    buildingName?: string;
    meters?: Array<{
        name: string;
        lastReading?: string;
        unit?: string;
    }>;
    submissionLink: string;
    periodLabel?: string;
    deadline?: string;
    reminderStage?: 'start' | 'end' | 'close';
    daysUntilDeadline?: number;
}
export declare const meterReadingReminderTemplates: Record<EmailLanguage, (params: MeterReadingReminderParams) => EmailTemplate>;
