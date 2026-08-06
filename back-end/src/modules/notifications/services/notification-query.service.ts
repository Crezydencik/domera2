import { BadRequestException, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { RequestUser } from '../../../common/auth/request-user.type';
import { NotificationAccessService } from './notification-access.service';
import { NotificationRepositoryService } from './notification-repository.service';
import { NotificationSettingsService } from './notification-settings.service';

@Injectable()
export class NotificationQueryService {
  constructor(
    private readonly accessService: NotificationAccessService,
    private readonly repositoryService: NotificationRepositoryService,
    private readonly settingsService: NotificationSettingsService,
  ) {}

  async list(request: Request, user: RequestUser, userId: string) {
    this.accessService.assertAuth(user);
    const normalizedUserId = userId?.trim();
    if (!normalizedUserId) throw new BadRequestException('userId is required');

    this.accessService.ensureUserAccess(user, normalizedUserId);
    await this.accessService.enforceRateLimit(request, 'notifications:list', `${user.uid}:${normalizedUserId}`, 60);

    const settings = await this.settingsService.getUserNotificationSettings(normalizedUserId);
    if (!settings.general) {
      return { items: [] };
    }

    const [nestedSnap, legacySnap] = await Promise.all([
      this.repositoryService.userNotificationsCollection(normalizedUserId)
        .orderBy('createdAt', 'desc')
        .limit(100)
        .get(),
      this.repositoryService.getLegacyNotificationsSnapshot(normalizedUserId),
    ]);

    const itemsById = new Map<string, { id: string } & Record<string, unknown>>();
    [...nestedSnap.docs, ...legacySnap.docs].forEach((doc) => {
      const data = doc.data() as Record<string, unknown>;
      itemsById.set(doc.id, {
        ...data,
        id: doc.id,
      });
    });

    const items = Array.from(itemsById.values())
      .sort((left, right) => this.repositoryService.notificationCreatedAtMillis(right) - this.repositoryService.notificationCreatedAtMillis(left))
      .slice(0, 100)
      .filter((item) => item.read !== true);

    const filteredItems = items.filter((item) => {
      const type = typeof item.type === 'string' ? item.type : '';
      const channel = typeof item.channel === 'string' ? item.channel : '';
      const scope = `${type} ${channel}`.toLowerCase();

      if (!settings.meterReminder && scope.includes('reading')) return false;
      if (!settings.paymentReminder && (scope.includes('payment') || scope.includes('invoice') || scope.includes('billing'))) return false;
      return true;
    });

    return { items: filteredItems };
  }

  async create(request: Request, user: RequestUser, payload: Record<string, unknown>) {
    this.accessService.assertAuth(user);

    const targetUserId = typeof payload.userId === 'string' ? payload.userId.trim() : '';
    if (!targetUserId) throw new BadRequestException('userId is required');

    this.accessService.ensureUserAccess(user, targetUserId);
    await this.accessService.enforceRateLimit(request, 'notifications:create', `${user.uid}:${targetUserId}`, 40);

    const ref = this.repositoryService.userNotificationsCollection(targetUserId).doc();
    const data = {
      ...payload,
      notificationId: ref.id,
      userId: targetUserId,
      read: Boolean(payload.read ?? false),
      createdAt: new Date(),
    };

    await ref.set(data);

    return { id: ref.id, ...data };
  }
}
