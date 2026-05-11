import { EmailTemplate, EmailLanguage } from '../email.types';
export interface OwnerInvitationParams {
    companyName: string;
    invitationLink: string;
    buildingName?: string;
    apartmentNumber?: string;
}
export declare const ownerInvitationTemplates: Record<EmailLanguage, (params: OwnerInvitationParams) => EmailTemplate>;
