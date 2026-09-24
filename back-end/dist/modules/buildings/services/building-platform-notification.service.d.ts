import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
export declare class BuildingPlatformNotificationService {
    private readonly firebaseAdminService;
    constructor(firebaseAdminService: FirebaseAdminService);
    notifyPlatformAdminsAboutCreationRequest(params: {
        requestId: string;
        companyId: string;
        companyName: string;
        requestedBy: string;
        requesterEmail?: string;
        buildingName?: string;
        buildingAddress?: string;
        comment?: string;
        subscriptionTermYears?: number;
        subscriptionTermMonths?: number;
    }): Promise<number>;
    markCreationRequestNotificationsRead(batch: FirebaseFirestore.WriteBatch, requestId: string, readAt: Date): Promise<void>;
    private getPlatformAdminDocs;
    private platformAdminCreationRequestNotificationRef;
}
