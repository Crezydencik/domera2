export declare class InvitationSummaryDto {
    id: string;
    email: string;
    apartmentId: string | null;
    status: string;
    expiresAt: string | null;
}
export declare class SendInvitationResponseDto {
    success: boolean;
    invitationId: string;
    invitationLink: string;
}
export declare class ResolveInvitationResponseDto {
    invitation: InvitationSummaryDto;
    existingAccountDetected: boolean;
}
export declare class AcceptInvitationResponseDto {
    success: boolean;
    mode: 'authenticated' | 'registration';
}
