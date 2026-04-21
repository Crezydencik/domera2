import { FirebaseAdminService } from '../../common/infrastructure/firebase/firebase-admin.service';
import { RequestUser } from '../../common/auth/request-user.type';
export declare class ResidentService {
    private readonly firebaseAdminService;
    constructor(firebaseAdminService: FirebaseAdminService);
    private toOptionalString;
    private toSerializable;
    apartments(user: RequestUser): Promise<{
        apartments: unknown;
        buildings: unknown;
    }>;
}
