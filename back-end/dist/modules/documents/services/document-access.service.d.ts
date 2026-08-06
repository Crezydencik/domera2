import { RequestUser } from '../../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { MemberApartment, UnknownRecord } from '../types/document.types';
import { DocumentHelperService } from './document-helper.service';
export declare class DocumentAccessService {
    private readonly firebaseAdminService;
    private readonly helperService;
    constructor(firebaseAdminService: FirebaseAdminService, helperService: DocumentHelperService);
    assertAuthenticated(user: RequestUser | undefined): asserts user is RequestUser;
    requireStaffCompanyId(user: RequestUser): string;
    isApartmentMember(apartment: UnknownRecord, user: RequestUser): boolean;
    private memberAccessForApartment;
    private documentVisibleForApartmentAccess;
    resolveMemberApartments(user: RequestUser): Promise<MemberApartment[]>;
    canAccessDocument(user: RequestUser, document: UnknownRecord, memberApartments?: MemberApartment[]): Promise<boolean>;
}
