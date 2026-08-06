import { RequestUser } from '../../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { MeterReadingAccessService } from './meter-reading-access.service';
import { MeterReadingBuildingService } from './meter-reading-building.service';
import { MeterReadingHelperService } from './meter-reading-helper.service';
export declare class MeterReadingQueryService {
    private readonly firebaseAdminService;
    private readonly accessService;
    private readonly buildingService;
    private readonly helperService;
    constructor(firebaseAdminService: FirebaseAdminService, accessService: MeterReadingAccessService, buildingService: MeterReadingBuildingService, helperService: MeterReadingHelperService);
    list(user: RequestUser, apartmentId?: string, companyId?: string): Promise<{
        items: Record<string, unknown>[];
    }>;
}
