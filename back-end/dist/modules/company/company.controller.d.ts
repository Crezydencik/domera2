import { Request } from 'express';
import { RequestUser } from '../../common/auth/request-user.type';
import { CompanyService } from './company.service';
export declare class CompanyController {
    private readonly companyService;
    constructor(companyService: CompanyService);
    create(request: Request, user: RequestUser, body: Record<string, unknown>): Promise<{
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
    createApiKey(request: Request, user: RequestUser, companyId: string, body: Record<string, unknown>): Promise<{
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
    update(request: Request, user: RequestUser, companyId: string, body: Record<string, unknown>): Promise<{
        success: boolean;
    }>;
    addMember(request: Request, user: RequestUser, companyId: string, body: Record<string, unknown>): Promise<{
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
