import { Injectable } from '@nestjs/common';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { getPlatformAdminDocs } from '../../../common/utils/platform-admins';

@Injectable()
export class BuildingPlatformNotificationService {
  constructor(private readonly firebaseAdminService: FirebaseAdminService) {}

  async notifyPlatformAdminsAboutCreationRequest(params: {
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
  }) {
    const admins = await this.getPlatformAdminDocs();
    if (admins.length === 0) {
      return 0;
    }

    const db = this.firebaseAdminService.firestore;
    const batch = db.batch();
    const createdAt = new Date();

    for (const admin of admins) {
      const notificationRef = this.platformAdminCreationRequestNotificationRef(admin.id, params.requestId);
      const buildingDetails = [params.buildingName, params.buildingAddress].filter(Boolean).join(', ');
      const description = buildingDetails
        ? `${params.companyName} requested approval to create ${buildingDetails}.`
        : `${params.companyName} requested access to add buildings.`;

      batch.set(
        notificationRef,
        {
          notificationId: notificationRef.id,
          userId: admin.id,
          type: 'building-creation-request',
          channel: 'Platform administration',
          title: 'Building creation request',
          description,
          actionHref: '/admin-buildings',
          actionLabel: 'Review request',
          companyId: params.companyId,
          companyName: params.companyName,
          requestedBy: params.requestedBy,
          requesterEmail: params.requesterEmail,
          buildingName: params.buildingName,
          buildingAddress: params.buildingAddress,
          comment: params.comment,
          subscriptionTermYears: params.subscriptionTermYears,
          subscriptionTermMonths: params.subscriptionTermMonths,
          read: false,
          createdAt,
        },
        { merge: true },
      );
    }

    await batch.commit();
    return admins.length;
  }

  async markCreationRequestNotificationsRead(
    batch: FirebaseFirestore.WriteBatch,
    requestId: string,
    readAt: Date,
  ) {
    const admins = await this.getPlatformAdminDocs();
    for (const admin of admins) {
      batch.set(
        this.platformAdminCreationRequestNotificationRef(admin.id, requestId),
        { read: true, readAt, updatedAt: readAt },
        { merge: true },
      );
    }
  }

  private getPlatformAdminDocs() {
    return getPlatformAdminDocs(this.firebaseAdminService.firestore);
  }

  private platformAdminCreationRequestNotificationRef(adminId: string, requestId: string) {
    return this.firebaseAdminService.firestore
      .collection('users')
      .doc(adminId)
      .collection('notifications')
      .doc(`building-creation-${requestId}`);
  }
}
