import { RequestUser } from '../../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
export declare class ApartmentAccessService {
    private readonly firebaseAdminService;
    constructor(firebaseAdminService: FirebaseAdminService);
    assertAuthenticated(user: RequestUser | undefined): asserts user is RequestUser;
    isStaff(user: RequestUser): boolean;
    isPropertyMember(user: RequestUser): boolean;
    effectiveStaffCompanyId(user: RequestUser): string;
    apartmentBelongsToStaffCompany(user: RequestUser, apartment: Record<string, unknown>): boolean;
    assertApartmentCompanyAccess(user: RequestUser, apartment: Record<string, unknown>): void;
    assertApartmentBuildingEditableForStaff(user: RequestUser, apartment: Record<string, unknown>): Promise<void>;
    getAccessibleApartmentIds(user: RequestUser): Promise<string[]>;
    canManageTenants(user: RequestUser, apartment: Record<string, unknown>): boolean;
    hasApartmentOccupant(apartment: Record<string, unknown>): boolean;
    private firstString;
}
