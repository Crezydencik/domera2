import { Request } from 'express';
import { RequestUser } from '../../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { EmailService } from '../../emails/services/email.service';
import { ApartmentsRepository } from '../repositories/apartments.repository';
export type ApartmentInvitationContext = {
    companyName: string;
    buildingName: string;
    apartmentNumber: string;
};
export declare class ApartmentInvitationService {
    private readonly firebaseAdminService;
    private readonly emailService;
    private readonly apartmentsRepository;
    private readonly logger;
    constructor(firebaseAdminService: FirebaseAdminService, emailService: EmailService, apartmentsRepository: ApartmentsRepository);
    resolveFrontendUrl(request?: Request): string;
    buildInvitationActionHref(invitationLink: string): string;
    resolveApartmentCompanyId(apartment: Record<string, unknown>): string;
    createApartmentInvitation(params: {
        apartmentId: string;
        apartment: Record<string, unknown>;
        email: string;
        user: RequestUser;
        request?: Request;
        inviteType: 'owner' | 'tenant';
        role: 'Landlord' | 'Resident';
        accountType: 'Landlord' | 'Resident';
        firstName?: string;
        lastName?: string;
    }): Promise<{
        invitationId: string;
        invitationLink: string;
    }>;
    resolveInvitationContext(apartment: Record<string, unknown>): Promise<ApartmentInvitationContext>;
    createOwnerInvitationNotification(params: {
        ownerId?: string;
        invitationLink: string;
        apartmentNumber: string;
        buildingName: string;
        companyName: string;
    }): Promise<void>;
    createTenantInvitationNotification(params: {
        tenantId?: string;
        invitationLink: string;
        apartmentNumber: string;
        buildingName: string;
        companyName: string;
    }): Promise<void>;
    emailPlatformAdminsAboutApartmentRequest(params: {
        request: Request;
        inviteType: 'owner' | 'tenant';
        inviteeEmail: string;
        apartmentId: string;
        apartmentNumber: string;
        buildingName: string;
        companyName: string;
    }): Promise<void>;
    private buildInvitationLink;
    private revokePendingInvitations;
    private getPlatformAdminDocs;
    private firstString;
}
