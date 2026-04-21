import { Request } from 'express';
import { RequestUser } from '../../common/auth/request-user.type';
import { InvitationsService } from './invitations.service';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { ResolveInvitationDto } from './dto/resolve-invitation.dto';
import { SendInvitationDto } from './dto/send-invitation.dto';
export declare class InvitationsController {
    private readonly invitationsService;
    constructor(invitationsService: InvitationsService);
    list(request: Request, user: RequestUser, companyId: string): Promise<{
        items: {
            id: string;
            companyId: string | undefined;
            apartmentId: string;
            email: string;
            status: string;
            token: string | undefined;
            tokenHash: string | undefined;
            invitedByUid: string | undefined;
            createdAt: Date;
            expiresAt: Date | undefined;
        }[];
    }>;
    byEmail(request: Request, user: RequestUser, email: string): Promise<{
        invitation: null;
    } | {
        invitation: {
            id: string;
            companyId: string | undefined;
            apartmentId: string;
            email: string;
            status: string;
            token: string | undefined;
            tokenHash: string | undefined;
            invitedByUid: string | undefined;
            createdAt: Date;
            expiresAt: Date | undefined;
        };
    }>;
    send(request: Request, user: RequestUser, body: SendInvitationDto): Promise<{
        success: boolean;
        invitationId: string;
        invitationLink: string;
    }>;
    resolve(request: Request, query: ResolveInvitationDto): Promise<{
        invitation: {
            id: string;
            email: string;
            apartmentId: string | null;
            status: string;
            expiresAt: string | null;
        };
        existingAccountDetected: boolean;
    }>;
    accept(request: Request, user: RequestUser | undefined, body: AcceptInvitationDto): Promise<{
        success: boolean;
        mode: string;
    }>;
    revoke(request: Request, user: RequestUser, invitationId: string): Promise<{
        success: boolean;
    }>;
}
