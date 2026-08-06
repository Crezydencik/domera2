import { Request } from 'express';
import { RequestUser } from '../../../common/auth/request-user.type';
import { ApartmentsService } from '../apartments.service';
import { InviteTenantDto } from '../dto/invite-tenant.dto';
import { UpdateTenantDto } from '../dto/update-tenant.dto';
export declare class ApartmentTenantController {
    private readonly apartmentsService;
    constructor(apartmentsService: ApartmentsService);
    inviteTenant(request: Request, user: RequestUser, apartmentId: string, body: InviteTenantDto): Promise<{
        success: boolean;
        invitationLink: string;
        invitationId: string;
    }>;
    removeTenant(request: Request, user: RequestUser, apartmentId: string, tenantUserId: string): Promise<{
        success: boolean;
    }>;
    updateTenant(request: Request, user: RequestUser, apartmentId: string, tenantUserId: string, body: UpdateTenantDto): Promise<{
        success: boolean;
    }>;
    resendTenantInvitation(request: Request, user: RequestUser, apartmentId: string, tenantEmail: string): Promise<{
        success: boolean;
    }>;
    unassignResident(request: Request, user: RequestUser, apartmentId: string): Promise<{
        success: boolean;
    }>;
}
