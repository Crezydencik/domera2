import { ConfigService } from '@nestjs/config';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
export declare class AuthProfileProvisioningService {
    private readonly firebaseAdminService;
    private readonly configService;
    constructor(firebaseAdminService: FirebaseAdminService, configService: ConfigService);
    isConfiguredPlatformAdmin(input: {
        uid?: string;
        email?: string;
    }): boolean;
    ensureUserProfileDocument(input: {
        uid: string;
        email: string;
        accountType?: string;
        role?: string;
        firstName?: string;
        lastName?: string;
        phone?: string;
        companyName?: string;
        registrationNumber?: string;
        apartmentId?: string;
        acceptedPrivacyPolicyAt?: Date;
        acceptedTermsAt?: Date;
    }): Promise<Record<string, unknown>>;
    ensureManagementCompanyDocument(input: {
        uid: string;
        email: string;
        companyEmail?: string;
        phone?: string;
        companyName?: string;
        registrationNumber?: string;
    }): Promise<Record<string, unknown>>;
    private normalizeEmail;
    private getConfiguredPlatformAdmins;
    private isSameDocumentValue;
    private hasDocumentChanges;
    private getCompanyStorageFolders;
    private ensureCompanyStorageFolders;
}
