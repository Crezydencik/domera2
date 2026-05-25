import { Request } from 'express';
import { FirebaseAdminService } from '../../common/infrastructure/firebase/firebase-admin.service';
import { RequestUser } from '../../common/auth/request-user.type';
import { RateLimitService } from '../../common/services/rate-limit.service';
import { EmailService } from '../emails/email.service';
export declare class CompanyService {
    private readonly firebaseAdminService;
    private readonly rateLimitService;
    private readonly emailService;
    constructor(firebaseAdminService: FirebaseAdminService, rateLimitService: RateLimitService, emailService: EmailService);
    private assertAuthenticated;
    private enforceRateLimit;
    private normalizeCompanyPayload;
    private getCompanyStorageFolders;
    private markStorageFolders;
    create(request: Request, user: RequestUser, payload: Record<string, unknown>): Promise<{
        companyName: string;
        manager: any[];
        companyId: string;
        userIds: string[];
        buildings: any[];
        createdAt: Date;
        updatedAt: Date;
        id: string;
    }>;
    byId(request: Request, user: RequestUser, companyId: string): Promise<{
        id: string;
    }>;
    update(request: Request, user: RequestUser, companyId: string, payload: Record<string, unknown>): Promise<{
        success: boolean;
    }>;
    private resolveFrontendUrl;
    private attachMemberToCompany;
    private sendMemberRegistrationInvitation;
    addMember(request: Request, user: RequestUser, companyId: string, payload: Record<string, unknown>): Promise<{
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
            role: "ManagementCompany" | "Accountant";
            accountType: "ManagementCompany" | "Resident" | "Landlord";
            companyId: string;
        };
        invitation?: undefined;
    }>;
    removeMember(request: Request, user: RequestUser, companyId: string, memberId: string): Promise<{
        success: boolean;
        memberId: string;
    }>;
}
