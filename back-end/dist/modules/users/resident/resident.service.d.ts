import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { RequestUser } from '../../../common/auth/request-user.type';
export declare class ResidentService {
    private readonly firebaseAdminService;
    private readonly logger;
    private readonly apartmentsTimeoutMs;
    private readonly apartmentsFallbackCache;
    constructor(firebaseAdminService: FirebaseAdminService);
    private emptyApartmentsResponse;
    private getCachedApartmentsResponse;
    private setCachedApartmentsResponse;
    private withTimeout;
    private toOptionalString;
    private firstDisplayString;
    private compareApartmentOrder;
    private normalizeStaffContacts;
    private toSerializable;
    apartments(user: RequestUser): Promise<{}>;
    private loadApartments;
}
