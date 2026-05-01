import { Request } from 'express';
import { FirebaseAdminService } from '../../common/infrastructure/firebase/firebase-admin.service';
import { RequestUser } from '../../common/auth/request-user.type';
import { RateLimitService } from '../../common/services/rate-limit.service';
export declare class BuildingsService {
    private readonly firebaseAdminService;
    private readonly rateLimitService;
    constructor(firebaseAdminService: FirebaseAdminService, rateLimitService: RateLimitService);
    private assertManagement;
    private enforceRateLimit;
    private firstString;
    private firstNumber;
    private normalizeStatus;
    private normalizeMeterCount;
    private normalizeReadingConfig;
    private normalizeSubmissionPeriod;
    private buildReadablePrefix;
    private buildSecureRandomToken;
    private generateBuildingId;
    private isApartmentOccupied;
    private getBuildingOccupancyStats;
    private applyOccupancyStats;
    private getCompanySummary;
    private normalizeBuildingPayload;
    getCreationAccess(request: Request, user: RequestUser, companyId: string): Promise<{
        allowed: boolean;
        requiresSubscription: boolean;
        requiresCode: boolean;
        message: null;
    }>;
    list(request: Request, user: RequestUser, companyId: string): Promise<{
        items: {
            apartmentsCount: number;
            occupiedApartments: number;
            id: string;
        }[];
    }>;
    byId(request: Request, user: RequestUser, buildingId: string): Promise<{
        apartmentsCount: number;
        occupiedApartments: number;
        id: string;
    }>;
    create(request: Request, user: RequestUser, payload: Record<string, unknown>): Promise<{
        createdAt: Date;
        updatedAt: Date;
        name: string;
        title: string;
        address: string;
        street: string;
        location: string;
        companyId: string;
        managedBy: {
            companyId: string;
            companyName: string;
            companyEmail?: string;
            companyPhone?: string;
        };
        apartmentsCount: number;
        apartmentIds: string[];
        status: string;
        readingConfig: {
            waterEnabled: boolean;
            electricityEnabled: boolean;
            heatingEnabled: boolean;
            hotWaterMetersPerResident: number;
            coldWaterMetersPerResident: number;
            submissionPeriod: {
                startDate: string;
                endDate: string;
                monthly: boolean;
            } | null;
        };
        id: string;
    }>;
    update(request: Request, user: RequestUser, buildingId: string, payload: Record<string, unknown>): Promise<{
        success: boolean;
    }>;
    remove(request: Request, user: RequestUser, buildingId: string): Promise<{
        success: boolean;
    }>;
}
