import { Request } from 'express';
import { FirebaseAdminService } from '../../common/infrastructure/firebase/firebase-admin.service';
import { RequestUser } from '../../common/auth/request-user.type';
import { RateLimitService } from '../../common/services/rate-limit.service';
import { AuditLogService } from '../../common/services/audit-log.service';
import { EmailService } from '../emails/email.service';
export declare class CompanyService {
    private readonly firebaseAdminService;
    private readonly rateLimitService;
    private readonly auditLogService;
    private readonly emailService;
    constructor(firebaseAdminService: FirebaseAdminService, rateLimitService: RateLimitService, auditLogService: AuditLogService, emailService: EmailService);
    private assertAuthenticated;
    private enforceRateLimit;
    private assertCanManageApiKeys;
    private assertCompanyAccess;
    private hashApiKey;
    private buildApiKey;
    private firstString;
    private toOptionalTrimmedString;
    private normalizeStaffContacts;
    private getBuildingApiKeyCollection;
    private firestoreDateToIso;
    private mapApiKeyDocument;
    private getCompanyBuildingContexts;
    private normalizeCompanyPayload;
    private getCompanyStorageFolders;
    private markStorageFolders;
    create(request: Request, user: RequestUser, payload: Record<string, unknown>): Promise<{
        companyName: string;
        manager: string[];
        companyId: string;
        userIds: string[];
        buildings: string[];
        createdAt: Date;
        updatedAt: Date;
        id: string;
    }>;
    byId(request: Request, user: RequestUser, companyId: string): Promise<{
        staffContacts: Record<string, unknown>[];
        publicContacts: {
            id: string;
            fullName: string;
            email: string;
            phone: string;
            position: string;
            role: string;
        }[];
        id: string;
    }>;
    update(request: Request, user: RequestUser, companyId: string, payload: Record<string, unknown>): Promise<{
        success: boolean;
    }>;
    listApiKeys(request: Request, user: RequestUser, companyId: string): Promise<{
        items: {
            id: string;
            label: string;
            trackingId: string;
            keyPrefix: string;
            buildingId: string | null;
            buildingName: string | null;
            status: string;
            scopes: string[];
            permission: string;
            ownerType: string;
            createdAt: string | null;
            revokedAt: string | null;
            lastUsedAt: string | null;
            createdByUid: string | null;
        }[];
    }>;
    createApiKey(request: Request, user: RequestUser, companyId: string, payload: Record<string, unknown>): Promise<{
        success: boolean;
        apiKey: string;
        item: {
            id: string;
            label: string;
            trackingId: string;
            keyPrefix: string;
            buildingId: string | null;
            buildingName: string | null;
            status: string;
            scopes: string[];
            permission: string;
            ownerType: string;
            createdAt: string | null;
            revokedAt: string | null;
            lastUsedAt: string | null;
            createdByUid: string | null;
        };
    }>;
    revokeApiKey(request: Request, user: RequestUser, companyId: string, keyId: string): Promise<{
        success: boolean;
        keyId: string;
    }>;
    private resolveFrontendUrl;
    private attachMemberToCompany;
    private sendMemberRegistrationInvitation;
    addMember(request: Request, user: RequestUser, companyId: string, payload: Record<string, unknown>): Promise<{
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
            role: "ManagementCompany" | "Accountant";
            accountType: "PlatformAdmin" | "ManagementCompany" | "Resident" | "Landlord";
            companyId: string;
        };
        invitation?: undefined;
    }>;
    removeMember(request: Request, user: RequestUser, companyId: string, memberId: string): Promise<{
        success: boolean;
        memberId: string;
    }>;
}
