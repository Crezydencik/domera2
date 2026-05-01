import { EmailTemplate, EmailLanguage } from '../email.types';
export declare const registrationCodeTemplates: Record<EmailLanguage, (code: string) => EmailTemplate>;
