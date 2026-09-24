import { Request } from 'express';
import { RequestUser } from '../../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { EmailService } from '../../emails/services/email.service';
import { CompanyAccessService } from './company-access.service';
import { CompanyMemberPermissions, CompanyPayloadService } from './company-payload.service';
type CompanyMemberRole = 'ManagementCompany' | 'Accountant';
export declare class CompanyMemberService {
    private readonly firebaseAdminService;
    private readonly emailService;
    private readonly accessService;
    private readonly payloadService;
    constructor(firebaseAdminService: FirebaseAdminService, emailService: EmailService, accessService: CompanyAccessService, payloadService: CompanyPayloadService);
    private resolveFrontendUrl;
    private sanitizePermissionsForRole;
    private attachMemberToCompany;
    private sendMemberRegistrationInvitation;
    private sendExistingMemberAccessNotification;
    add(request: Request, user: RequestUser, companyId: string, payload: Record<string, unknown>): Promise<{
        success: boolean;
        mode: string;
        member: {
            showContactToResidents: boolean;
            role: string;
            createAccount: boolean;
            comment?: string | undefined;
            position?: string | undefined;
            jobTitle?: string | undefined;
            phone?: string | undefined;
            fullName: string;
            name: string;
            lastName?: string | undefined;
            firstName: string;
            email?: string | undefined;
            id: string;
        };
        invitation?: undefined;
    } | {
        success: boolean;
        mode: string;
        invitation: {
            invitationId: string;
            invitationLink: string;
        };
        member?: undefined;
    } | {
        success: boolean;
        mode: string;
        member: {
            id: string;
            uid: string;
            email: string;
            firstName: string;
            lastName: string;
            fullName: string;
            phone: string | undefined;
            position: string | undefined;
            showContactToResidents: boolean;
            role: CompanyMemberRole;
            accountType: "PlatformAdmin" | "ManagementCompany" | "Resident" | "Landlord";
            companyId: string;
            permissions: CompanyMemberPermissions;
            memberType: string;
        };
        invitation?: undefined;
    }>;
    remove(request: Request, user: RequestUser, companyId: string, memberId: string): Promise<{
        success: boolean;
        memberId: string;
    }>;
    update(request: Request, user: RequestUser, companyId: string, memberId: string, payload: Record<string, unknown>): Promise<{
        success: boolean;
        member: {
            id: string;
            uid: string;
            email: string;
            firstName: string;
            lastName: string;
            fullName: string;
            phone: string | undefined;
            position: string | undefined;
            showContactToResidents: boolean;
            role: string;
            accountType: "PlatformAdmin" | "ManagementCompany" | "Resident" | "Landlord";
            companyId: string;
            permissions: CompanyMemberPermissions;
            memberType: string;
        };
    }>;
    updatePermissions(request: Request, user: RequestUser, companyId: string, memberId: string, payload: Record<string, unknown>): Promise<{
        success: boolean;
        memberId: string;
        permissions: CompanyMemberPermissions;
    }>;
}
export {};
