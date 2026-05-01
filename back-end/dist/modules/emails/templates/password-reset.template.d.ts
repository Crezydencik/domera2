import { EmailTemplate, EmailLanguage } from '../email.types';
export declare const passwordResetTemplates: Record<EmailLanguage, (resetLink: string) => EmailTemplate>;
