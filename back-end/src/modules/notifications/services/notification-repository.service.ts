import { Injectable } from '@nestjs/common';
import { RequestUser } from '../../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';

@Injectable()
export class NotificationRepositoryService {
  constructor(private readonly firebaseAdminService: FirebaseAdminService) {}

  userNotificationsCollection(userId: string): FirebaseFirestore.CollectionReference {
    return this.firebaseAdminService.firestore
      .collection('users')
      .doc(userId)
      .collection('notifications');
  }

  notificationCreatedAtMillis(item: Record<string, unknown>): number {
    const createdAt = item.createdAt;
    if (createdAt instanceof Date) return createdAt.getTime();
    if (createdAt && typeof (createdAt as { toMillis?: unknown }).toMillis === 'function') {
      return (createdAt as { toMillis: () => number }).toMillis();
    }
    return 0;
  }

  async getLegacyNotificationsSnapshot(userId: string): Promise<FirebaseFirestore.QuerySnapshot> {
    const baseQuery = this.firebaseAdminService.firestore
      .collection('notifications')
      .where('userId', '==', userId);

    try {
      return await baseQuery
        .orderBy('createdAt', 'desc')
        .limit(100)
        .get();
    } catch (error) {
      if (!this.isMissingFirestoreIndexError(error)) throw error;

      return baseQuery
        .limit(500)
        .get();
    }
  }

  async findNotificationDocument(
    notificationId: string,
    fallbackUserId?: string,
  ): Promise<FirebaseFirestore.DocumentSnapshot | null> {
    if (fallbackUserId) {
      const directNestedSnap = await this.userNotificationsCollection(fallbackUserId).doc(notificationId).get();
      if (directNestedSnap.exists) return directNestedSnap;
    }

    const nestedSnap = await this.firebaseAdminService.firestore
      .collectionGroup('notifications')
      .where('notificationId', '==', notificationId)
      .limit(1)
      .get();
    if (!nestedSnap.empty) return nestedSnap.docs[0] ?? null;

    const legacySnap = await this.firebaseAdminService.firestore.collection('notifications').doc(notificationId).get();
    return legacySnap.exists ? legacySnap : null;
  }

  notificationOwnerId(snap: FirebaseFirestore.DocumentSnapshot, currentUser: RequestUser) {
    const data = snap.data() as Record<string, unknown>;
    const ownerFromData = typeof data.userId === 'string' ? data.userId : '';
    if (ownerFromData) return ownerFromData;

    const ownNotificationPath = `users/${currentUser.uid}/notifications/`;
    return snap.ref.path.startsWith(ownNotificationPath) ? currentUser.uid : '';
  }

  private isMissingFirestoreIndexError(error: unknown): boolean {
    const details = error && typeof error === 'object' ? error as { code?: unknown; details?: unknown; message?: unknown } : {};
    const text = [details.details, details.message]
      .filter((value): value is string => typeof value === 'string')
      .join(' ')
      .toLowerCase();

    return details.code === 9 || details.code === 'failed-precondition' || text.includes('requires an index');
  }
}
