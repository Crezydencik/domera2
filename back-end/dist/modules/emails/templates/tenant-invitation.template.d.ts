import { EmailTemplate, EmailLanguage } from '../email.types';
export interface TenantInvitationParams {
    companyName: string;
    brandName?: string;
    buildingName?: string;
    apartmentNumber?: string;
    invitationLink: string;
    senderName?: string;
}
export declare const tenantInvitationTemplates: Record<EmailLanguage, (params: TenantInvitationParams) => EmailTemplate>;
