import { Request } from 'express';
import { RequestUser } from '../../common/auth/request-user.type';
import { CompanyInvitationsService } from './company-invitations.service';
import { AcceptCompanyInvitationDto } from './dto/accept-company-invitation.dto';
import { ListCompanyInvitationsDto } from './dto/list-company-invitations.dto';
import { SendCompanyInvitationDto } from './dto/send-company-invitation.dto';
export declare class CompanyInvitationsController {
    private readonly service;
    constructor(service: CompanyInvitationsService);
    list(request: Request, user: RequestUser, query: ListCompanyInvitationsDto): Promise<{
        invitations: {
            id: string;
        }[];
    }>;
    send(request: Request, user: RequestUser, body: SendCompanyInvitationDto): Promise<{
        success: boolean;
        invitationId: string;
    }>;
    accept(request: Request, user: RequestUser, body: AcceptCompanyInvitationDto): Promise<{
        success: boolean;
    }>;
}
