export declare class CompanyInvitationItemDto {
    id: string;
    email: string;
    companyId: string;
    buildingId: string;
    role: string;
    status: string;
}
export declare class CompanyInvitationListResponseDto {
    invitations: CompanyInvitationItemDto[];
}
export declare class CompanyInvitationMutationResponseDto {
    success: boolean;
    invitationId?: string;
}
