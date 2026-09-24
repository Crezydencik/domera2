import { Request } from 'express';
import { RequestUser } from '../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../common/infrastructure/firebase/firebase-admin.service';
import { RateLimitService } from '../../common/services/rate-limit.service';
import { BuildingsService } from '../buildings/buildings.service';
export declare class UsersService {
    private readonly firebaseAdminService;
    private readonly rateLimitService;
    private readonly buildingsService;
    private readonly propertyMembershipCache;
    constructor(firebaseAdminService: FirebaseAdminService, rateLimitService: RateLimitService, buildingsService: BuildingsService);
    private assertAuth;
    private isStaff;
    private isPlatformAdmin;
    private ensureUserAccess;
    private ensureCompanyAccess;
    private toOptionalString;
    private normalizedEmail;
    private resolveProfileNames;
    private propertyMembershipCacheKey;
    private trimPropertyMembershipCache;
    private invalidatePropertyMembershipCache;
    private resolvePropertyMembership;
    private resolvePropertyMembershipUncached;
    syncLinkedApartmentProfiles(userId: string, previousData: Record<string, unknown>, nextData: Record<string, unknown>): Promise<void>;
    private normalizeProfilePayload;
    private enforceRateLimit;
    byId(request: Request, user: RequestUser, userId: string): Promise<{
        id: string;
    } | null>;
    me(request: Request, user: RequestUser): Promise<{
        hasOwnership: boolean;
        hasTenancy: boolean;
        propertyRoles: string[];
        id: string;
        uid: string;
        email: string | undefined;
        role: "PlatformAdmin" | "ManagementCompany" | "Accountant" | "Resident" | "Landlord" | undefined;
        accountType: "PlatformAdmin" | "ManagementCompany" | "Resident" | "Landlord" | undefined;
        companyId: string | undefined;
        apartmentId: string | undefined;
    } | {
        hasOwnership: boolean;
        hasTenancy: boolean;
        propertyRoles: string[];
        id: string;
    }>;
    byEmail(request: Request, user: RequestUser, email: string): Promise<{
        id: string;
    } | null>;
    listByCompany(request: Request, user: RequestUser, companyId: string): Promise<{
        items: {
            id: string;
        }[];
    }>;
    listAll(request: Request, user: RequestUser): Promise<{
        items: {
            buildingCreationRequestStatus?: string | undefined;
            buildingCreationRequestId?: string | undefined;
            buildingCreationRequestBuildingName?: string | undefined;
            buildingCreationRequestBuildingAddress?: string | undefined;
            buildingCreationRequests: Record<string, unknown>[];
            id: string;
        }[];
    }>;
    setBuildingCreationAccess(request: Request, user: RequestUser, userId: string, payload: Record<string, unknown>): Promise<{
        userId: string;
        success: boolean;
        status: string;
        requestId: string;
        buildingId: string;
        billingInvoiceId: string | undefined;
    }>;
    upsert(request: Request, user: RequestUser, userId: string, payload: Record<string, unknown>): Promise<{
        success: boolean;
    }>;
    update(request: Request, user: RequestUser, userId: string, payload: Record<string, unknown>): Promise<{
        success: boolean;
    }>;
}
