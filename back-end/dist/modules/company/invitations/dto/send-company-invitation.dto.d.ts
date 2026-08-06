export declare class SendCompanyInvitationDto {
    email: string;
    companyId: string;
    buildingId: string;
    role: 'Accountant' | 'ManagementCompany';
    buildingName?: string;
}
