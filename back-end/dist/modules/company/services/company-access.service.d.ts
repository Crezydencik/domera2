import { Request } from 'express';
import { RequestUser } from '../../../common/auth/request-user.type';
import { RateLimitService } from '../../../common/services/rate-limit.service';
export declare class CompanyAccessService {
    private readonly rateLimitService;
    constructor(rateLimitService: RateLimitService);
    assertAuthenticated(user: RequestUser | undefined): asserts user is RequestUser;
    enforceRateLimit(request: Request, scope: string, discriminator: string, limit: number): Promise<void>;
    assertCanManageApiKeys(user: RequestUser, companyId: string): void;
    assertCompanyAccess(user: RequestUser, companyId: string, company: Record<string, unknown>): void;
    assertMainCompanyManager(user: RequestUser, companyId: string, message: string): void;
}
