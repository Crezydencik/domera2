import { Request } from 'express';
import { RequestUser } from '../../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { AuditLogService } from '../../../common/services/audit-log.service';
import { RateLimitService } from '../../../common/services/rate-limit.service';
import { MeterReadingAccessService } from './meter-reading-access.service';
import { MeterReadingBuildingService } from './meter-reading-building.service';
import { MeterReadingHelperService } from './meter-reading-helper.service';
export declare class MeterReadingCrudService {
    private readonly firebaseAdminService;
    private readonly rateLimitService;
    private readonly auditLogService;
    private readonly accessService;
    private readonly buildingService;
    private readonly helperService;
    constructor(firebaseAdminService: FirebaseAdminService, rateLimitService: RateLimitService, auditLogService: AuditLogService, accessService: MeterReadingAccessService, buildingService: MeterReadingBuildingService, helperService: MeterReadingHelperService);
    create(request: Request, user: RequestUser, payload: Record<string, unknown>): Promise<{
        success: boolean;
        reading: Record<string, unknown> & {
            currentValue: number;
            previousValue: number;
            source?: string;
            meterReadingSource?: string;
        };
    }>;
    update(request: Request, user: RequestUser, readingId: string, apartmentId: string, payload: Record<string, unknown>): Promise<{
        success: boolean;
    }>;
    remove(request: Request, user: RequestUser, readingId: string, apartmentId: string): Promise<{
        success: boolean;
    }>;
}
