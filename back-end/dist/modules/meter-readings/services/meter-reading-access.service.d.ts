import { RequestUser } from '../../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { CompanyPayloadService } from '../../company/services/company-payload.service';
export declare class MeterReadingAccessService {
    private readonly firebaseAdminService;
    private readonly companyPayloadService;
    constructor(firebaseAdminService: FirebaseAdminService, companyPayloadService: CompanyPayloadService);
    assertAuthenticated(user: RequestUser | undefined): asserts user is RequestUser;
    requireStaffCompanyId(user: RequestUser): string;
    assertStaffApartmentCompanyAccess(user: RequestUser, apartment: Record<string, unknown>): void;
    assertCanManageStaffMeterReadings(user: RequestUser, apartment: Record<string, unknown>): Promise<void>;
    hasApartmentAccess(user: RequestUser, apartmentId: string, apartment: Record<string, unknown>): boolean;
    getAccessibleApartmentIds(user: RequestUser): Promise<string[]>;
}
