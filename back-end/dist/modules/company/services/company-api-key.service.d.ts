import { Request } from 'express';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { RequestUser } from '../../../common/auth/request-user.type';
import { AuditLogService } from '../../../common/services/audit-log.service';
import { CompanyAccessService } from './company-access.service';
import { CompanyPayloadService } from './company-payload.service';
export declare class CompanyApiKeyService {
    private readonly firebaseAdminService;
    private readonly auditLogService;
    private readonly accessService;
    private readonly payloadService;
    constructor(firebaseAdminService: FirebaseAdminService, auditLogService: AuditLogService, accessService: CompanyAccessService, payloadService: CompanyPayloadService);
    private hashApiKey;
    private buildApiKey;
    private getBuildingApiKeyCollection;
    private firestoreDateToIso;
    private mapApiKeyDocument;
    private getCompanyBuildingContexts;
    list(request: Request, user: RequestUser, companyId: string): Promise<{
        items: {
            id: string;
            label: string;
            trackingId: string;
            keyPrefix: string;
            buildingId: string | null;
            buildingName: string | null;
            status: string;
            scopes: string[];
            permission: string;
            ownerType: string;
            createdAt: string | null;
            revokedAt: string | null;
            lastUsedAt: string | null;
            createdByUid: string | null;
        }[];
    }>;
    create(request: Request, user: RequestUser, companyId: string, payload: Record<string, unknown>): Promise<{
        success: boolean;
        apiKey: string;
        item: {
            id: string;
            label: string;
            trackingId: string;
            keyPrefix: string;
            buildingId: string | null;
            buildingName: string | null;
            status: string;
            scopes: string[];
            permission: string;
            ownerType: string;
            createdAt: string | null;
            revokedAt: string | null;
            lastUsedAt: string | null;
            createdByUid: string | null;
        };
    }>;
    revoke(request: Request, user: RequestUser, companyId: string, keyId: string): Promise<{
        success: boolean;
        keyId: string;
    }>;
}
