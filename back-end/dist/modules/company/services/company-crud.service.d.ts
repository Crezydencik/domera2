import { Request } from 'express';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { RequestUser } from '../../../common/auth/request-user.type';
import { CompanyAccessService } from './company-access.service';
import { CompanyPayloadService } from './company-payload.service';
import { CompanyStorageService } from './company-storage.service';
export declare class CompanyCrudService {
    private readonly firebaseAdminService;
    private readonly accessService;
    private readonly payloadService;
    private readonly storageService;
    constructor(firebaseAdminService: FirebaseAdminService, accessService: CompanyAccessService, payloadService: CompanyPayloadService, storageService: CompanyStorageService);
    create(request: Request, user: RequestUser, payload: Record<string, unknown>): Promise<{
        companyName: string;
        manager: string[];
        companyId: string;
        userIds: string[];
        employees: never[];
        buildings: string[];
        createdAt: Date;
        updatedAt: Date;
        id: string;
    }>;
    byId(request: Request, user: RequestUser, companyId: string): Promise<{
        staffContacts: Record<string, unknown>[];
        currentUserPermissions: {
            isMainManager: boolean;
            viewCompanyInfo: boolean;
            editCompanyInfo: boolean;
            manageMembers: boolean;
            manageApiKeys: boolean;
            manageInvoiceSettings: boolean;
        };
        publicContacts: {
            id: string;
            fullName: string;
            email: string;
            phone: string;
            position: string;
            role: string;
        }[];
        id: string;
    }>;
    update(request: Request, user: RequestUser, companyId: string, payload: Record<string, unknown>): Promise<{
        success: boolean;
    }>;
}
