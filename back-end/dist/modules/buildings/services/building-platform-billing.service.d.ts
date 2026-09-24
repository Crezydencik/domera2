import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
export declare class BuildingPlatformBillingService {
    private readonly firebaseAdminService;
    constructor(firebaseAdminService: FirebaseAdminService);
    createPlatformBillingInvoice(params: {
        batch: FirebaseFirestore.WriteBatch;
        requestId: string;
        companyId: string;
        companyName: string;
        requestedBy?: string;
        requesterEmail?: string;
        buildingId: string;
        buildingName: string;
        buildingAddress: string;
        apartmentsCount: number;
        subscriptionTermMonths: number;
        pricePerApartment: number;
        reviewedAt: Date;
        reviewedBy: string;
    }): string | undefined;
    private buildPlatformBillingInvoiceId;
    private buildPlatformBillingInvoiceNumber;
    private sanitizePathSegment;
}
