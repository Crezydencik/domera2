import { Request } from 'express';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import type { UploadHistoryInput } from '../invoice.types';
export declare class InvoiceUploadHistoryService {
    private readonly firebaseAdminService;
    private readonly logger;
    constructor(firebaseAdminService: FirebaseAdminService);
    getApartmentInvoiceUploadHistoryCollection(apartmentId: string): FirebaseFirestore.CollectionReference;
    getLegacyBuildingInvoiceUploadHistoryCollection(buildingId: string): FirebaseFirestore.CollectionReference;
    apiCredentialMetadata(request?: Request): Record<string, unknown>;
    writeUploadHistory(input: UploadHistoryInput): Promise<void>;
    uploadHistoryStatusFromResults(results: Array<Record<string, unknown>>): string;
    updateUploadHistoryForApproval(params: {
        approvalId: string;
        buildingId: string;
        apartmentId?: string;
        companyId?: string;
        historyId?: string;
        historyBuildingId?: string;
        historyApartmentId?: string;
        invoiceId?: string;
        status: 'approved' | 'cancelled';
        error?: string;
    }): Promise<void>;
    toUploadHistoryBaseItem(params: {
        buildingId?: string;
        apartmentId?: string;
    }, historyDoc: FirebaseFirestore.QueryDocumentSnapshot): Record<string, unknown>;
    groupUploadHistoryItems(itemsByPath: Map<string, Record<string, unknown>>, limit: number): Array<Record<string, unknown> & {
        __sourceKeys: string[];
    }>;
    reconcileUploadHistoryDoc(params: {
        buildingId?: string;
        apartmentId?: string;
    }, historyDoc: FirebaseFirestore.QueryDocumentSnapshot): Promise<Record<string, unknown>>;
}
