import { Request } from 'express';
import { RequestUser } from '../../../common/auth/request-user.type';
import { ApartmentsService } from '../apartments.service';
import { InviteOwnerDto } from '../dto/invite-owner.dto';
export declare class ApartmentOwnerController {
    private readonly apartmentsService;
    constructor(apartmentsService: ApartmentsService);
    updateOwner(request: Request, user: RequestUser, apartmentId: string, body: InviteOwnerDto): Promise<{
        success: boolean;
        ownerActivated: boolean;
    }>;
    removeOwner(request: Request, user: RequestUser, apartmentId: string): Promise<{
        success: boolean;
    }>;
    resendOwnerInvitation(request: Request, user: RequestUser, apartmentId: string, ownerEmail: string): Promise<{
        success: boolean;
    }>;
}
