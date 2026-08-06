import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import { RequestUser } from '../../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { NotificationAccessService } from './notification-access.service';
import { NotificationRepositoryService } from './notification-repository.service';

@Injectable()
export class NotificationStateService {
  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly accessService: NotificationAccessService,
    private readonly repositoryService: NotificationRepositoryService,
  ) {}

  async markRead(request: Request, user: RequestUser, notificationId: string) {
    this.accessService.assertAuth(user);
    if (!notificationId?.trim()) throw new BadRequestException('notificationId is required');

    await this.accessService.enforceRateLimit(request, 'notifications:read', `${user.uid}:${notificationId}`, 80);

    const snap = await this.repositoryService.findNotificationDocument(notificationId, user.uid);
    if (!snap?.exists) throw new NotFoundException('Notification not found');

    const targetUserId = this.repositoryService.notificationOwnerId(snap, user);
    if (!targetUserId) throw new ForbiddenException('Invalid notification owner');

    this.accessService.ensureUserAccess(user, targetUserId);

    await snap.ref.set({ read: true, readAt: new Date(), updatedAt: new Date() }, { merge: true });
    return { success: true };
  }

  async markAllRead(request: Request, user: RequestUser, userId: string) {
    this.accessService.assertAuth(user);
    const normalizedUserId = userId?.trim();
    if (!normalizedUserId) throw new BadRequestException('userId is required');

    this.accessService.ensureUserAccess(user, normalizedUserId);
    await this.accessService.enforceRateLimit(request, 'notifications:read-all', `${user.uid}:${normalizedUserId}`, 20);

    const [nestedSnap, legacySnap] = await Promise.all([
      this.repositoryService.userNotificationsCollection(normalizedUserId)
        .where('read', '==', false)
        .get(),
      this.firebaseAdminService.firestore
        .collection('notifications')
        .where('userId', '==', normalizedUserId)
        .where('read', '==', false)
        .get(),
    ]);

    const batch = this.firebaseAdminService.firestore.batch();
    const docs = [...nestedSnap.docs, ...legacySnap.docs];
    docs.forEach((doc) => {
      batch.set(doc.ref, { read: true, readAt: new Date(), updatedAt: new Date() }, { merge: true });
    });
    await batch.commit();

    return { success: true, updated: docs.length };
  }

  async remove(request: Request, user: RequestUser, notificationId: string) {
    this.accessService.assertAuth(user);
    if (!notificationId?.trim()) throw new BadRequestException('notificationId is required');

    await this.accessService.enforceRateLimit(request, 'notifications:delete', `${user.uid}:${notificationId}`, 40);

    const snap = await this.repositoryService.findNotificationDocument(notificationId, user.uid);
    if (!snap?.exists) throw new NotFoundException('Notification not found');

    const targetUserId = this.repositoryService.notificationOwnerId(snap, user);
    if (!targetUserId) throw new ForbiddenException('Invalid notification owner');

    this.accessService.ensureUserAccess(user, targetUserId);

    await snap.ref.delete();
    return { success: true };
  }
}
