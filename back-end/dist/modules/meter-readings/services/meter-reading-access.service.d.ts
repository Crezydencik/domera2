import { RequestUser } from '../../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
export declare class MeterReadingAccessService {
    private readonly firebaseAdminService;
    constructor(firebaseAdminService: FirebaseAdminService);
    assertAuthenticated(user: RequestUser | undefined): asserts user is RequestUser;
    requireStaffCompanyId(user: RequestUser): string;
    assertStaffApartmentCompanyAccess(user: RequestUser, apartment: Record<string, unknown>): void;
    hasApartmentAccess(user: RequestUser, apartmentId: string, apartment: Record<string, unknown>): boolean;
    getAccessibleApartmentIds(user: RequestUser): Promise<string[]>;
}
