import { EmailTemplate, EmailLanguage } from '../email.types';
export interface TenantInvitedByOwnerParams {
    tenantName?: string;
    ownerName: string;
    buildingName?: string;
    apartmentNumber?: string;
    invitationLink: string;
}
export declare const tenantInvitedByOwnerTemplates: Record<EmailLanguage, (params: TenantInvitedByOwnerParams) => EmailTemplate>;
