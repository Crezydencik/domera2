import { Request } from 'express';
import { RequestUser } from '../../../common/auth/request-user.type';
import { RateLimitService } from '../../../common/services/rate-limit.service';
import { CompanyPayloadService } from './company-payload.service';
export declare class CompanyAccessService {
    private readonly rateLimitService;
    private readonly payloadService;
    constructor(rateLimitService: RateLimitService, payloadService: CompanyPayloadService);
    assertAuthenticated(user: RequestUser | undefined): asserts user is RequestUser;
    enforceRateLimit(request: Request, scope: string, discriminator: string, limit: number): Promise<void>;
    private listMemberIds;
    isMainCompanyManager(user: RequestUser, companyId: string, company: Record<string, unknown>): boolean;
    getCompanyPermissions(user: RequestUser, companyId: string, company: Record<string, unknown>): {
        isMainManager: boolean;
        viewCompanyInfo: boolean;
        viewApiKeys: boolean;
        editCompanyInfo: boolean;
        manageMembers: boolean;
        manageApiKeys: boolean;
        manageInvoiceSettings: boolean;
        manageMeterReadings: boolean;
        manageMeterReadingData: boolean;
    };
    assertCompanyAccess(user: RequestUser, companyId: string, company: Record<string, unknown>): void;
    assertMainCompanyManagerForCompany(user: RequestUser, companyId: string, company: Record<string, unknown>, message: string): void;
    assertCanEditCompanyInfo(user: RequestUser, companyId: string, company: Record<string, unknown>): void;
    assertCanManageMembers(user: RequestUser, companyId: string, company: Record<string, unknown>): void;
    assertCanManageApiKeys(user: RequestUser, companyId: string, company: Record<string, unknown>): void;
    assertCanViewApiKeys(user: RequestUser, companyId: string, company: Record<string, unknown>): void;
    assertCanManageInvoiceSettings(user: RequestUser, companyId: string, company: Record<string, unknown>): void;
}
