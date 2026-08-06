import { RequestUser } from '../../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
export declare class NotificationRepositoryService {
    private readonly firebaseAdminService;
    constructor(firebaseAdminService: FirebaseAdminService);
    userNotificationsCollection(userId: string): FirebaseFirestore.CollectionReference;
    notificationCreatedAtMillis(item: Record<string, unknown>): number;
    getLegacyNotificationsSnapshot(userId: string): Promise<FirebaseFirestore.QuerySnapshot>;
    findNotificationDocument(notificationId: string, fallbackUserId?: string): Promise<FirebaseFirestore.DocumentSnapshot | null>;
    notificationOwnerId(snap: FirebaseFirestore.DocumentSnapshot, currentUser: RequestUser): string;
    private isMissingFirestoreIndexError;
}
