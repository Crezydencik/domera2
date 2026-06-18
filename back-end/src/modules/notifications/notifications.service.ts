import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { RequestUser } from '../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../common/infrastructure/firebase/firebase-admin.service';
import { RateLimitService } from '../../common/services/rate-limit.service';

type NotificationSettings = {
  general: boolean;
  meterReminder: boolean;
  paymentReminder: boolean;
  language: 'ru' | 'lv' | 'en';
};

const defaultNotificationSettings: NotificationSettings = {
  general: true,
  meterReminder: true,
  paymentReminder: true,
  language: 'ru',
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  private userNotificationsCollection(userId: string): FirebaseFirestore.CollectionReference {
    return this.firebaseAdminService.firestore
      .collection('users')
      .doc(userId)
      .collection('notifications');
  }

  private notificationCreatedAtMillis(item: Record<string, unknown>): number {
    const createdAt = item.createdAt;
    if (createdAt instanceof Date) return createdAt.getTime();
    if (createdAt && typeof (createdAt as { toMillis?: unknown }).toMillis === 'function') {
      return (createdAt as { toMillis: () => number }).toMillis();
    }
    return 0;
  }

  private async findNotificationDocument(
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

  private notificationOwnerId(snap: FirebaseFirestore.DocumentSnapshot, currentUser: RequestUser) {
    const data = snap.data() as Record<string, unknown>;
    const ownerFromData = typeof data.userId === 'string' ? data.userId : '';
    if (ownerFromData) return ownerFromData;

    const ownNotificationPath = `users/${currentUser.uid}/notifications/`;
    return snap.ref.path.startsWith(ownNotificationPath) ? currentUser.uid : '';
  }

  private assertAuth(user: RequestUser | undefined): asserts user is RequestUser {
    if (!user?.uid) throw new UnauthorizedException('Authentication required');
  }

  private ensureUserAccess(currentUser: RequestUser, targetUserId: string) {
    if (currentUser.uid === targetUserId) return;
    if (!['ManagementCompany', 'Accountant'].includes(currentUser.role ?? '')) {
      throw new ForbiddenException('Access denied');
    }
  }

  private async enforceRateLimit(
    request: Request,
    scope: string,
    discriminator: string,
    limit: number,
  ): Promise<void> {
    const rl = await this.rateLimitService.consume(
      this.rateLimitService.buildKey(request, scope, discriminator),
      limit,
      60_000,
    );
    if (!rl.allowed) throw new BadRequestException('Too many requests');
  }

  private normalizeSettings(value: unknown): NotificationSettings {
    const settings = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    const language = settings.language === 'lv' || settings.language === 'en' || settings.language === 'ru'
      ? settings.language
      : defaultNotificationSettings.language;

    return {
      general: typeof settings.general === 'boolean' ? settings.general : defaultNotificationSettings.general,
      meterReminder: typeof settings.meterReminder === 'boolean' ? settings.meterReminder : defaultNotificationSettings.meterReminder,
      paymentReminder: typeof settings.paymentReminder === 'boolean' ? settings.paymentReminder : defaultNotificationSettings.paymentReminder,
      language,
    };
  }

  private async getUserNotificationSettings(userId: string): Promise<NotificationSettings> {
    const snap = await this.firebaseAdminService.firestore.collection('users').doc(userId).get();
    if (!snap.exists) return defaultNotificationSettings;

    const data = snap.data() as Record<string, unknown>;
    return this.normalizeSettings(data.notificate ?? data.notificationSettings);
  }

  async getSettings(request: Request, user: RequestUser) {
    this.assertAuth(user);
    await this.enforceRateLimit(request, 'notifications:settings:get', user.uid, 80);

    const settings = await this.getUserNotificationSettings(user.uid);
    return { settings };
  }

  async updateSettings(request: Request, user: RequestUser, payload: Record<string, unknown>) {
    this.assertAuth(user);
    await this.enforceRateLimit(request, 'notifications:settings:update', user.uid, 40);

    const current = await this.getUserNotificationSettings(user.uid);
    const next = this.normalizeSettings({
      ...current,
      ...payload,
    });

    await this.firebaseAdminService.firestore.collection('users').doc(user.uid).set(
      {
        uid: user.uid,
        email: user.email,
        notificate: next,
        notificationSettings: next,
        updatedAt: new Date(),
      },
      { merge: true },
    );

    return { success: true, settings: next };
  }

  async list(request: Request, user: RequestUser, userId: string) {
    this.assertAuth(user);
    const normalizedUserId = userId?.trim();
    if (!normalizedUserId) throw new BadRequestException('userId is required');

    this.ensureUserAccess(user, normalizedUserId);
    await this.enforceRateLimit(request, 'notifications:list', `${user.uid}:${normalizedUserId}`, 60);

    const settings = await this.getUserNotificationSettings(normalizedUserId);
    if (!settings.general) {
      return { items: [] };
    }

    const [nestedSnap, legacySnap] = await Promise.all([
      this.userNotificationsCollection(normalizedUserId)
        .orderBy('createdAt', 'desc')
        .limit(100)
        .get(),
      this.firebaseAdminService.firestore
        .collection('notifications')
        .where('userId', '==', normalizedUserId)
        .orderBy('createdAt', 'desc')
        .limit(100)
        .get(),
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
      .sort((left, right) => this.notificationCreatedAtMillis(right) - this.notificationCreatedAtMillis(left))
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
    this.assertAuth(user);

    const targetUserId = typeof payload.userId === 'string' ? payload.userId.trim() : '';
    if (!targetUserId) throw new BadRequestException('userId is required');

    this.ensureUserAccess(user, targetUserId);
    await this.enforceRateLimit(request, 'notifications:create', `${user.uid}:${targetUserId}`, 40);

    const ref = this.userNotificationsCollection(targetUserId).doc();
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

  async markRead(request: Request, user: RequestUser, notificationId: string) {
    this.assertAuth(user);
    if (!notificationId?.trim()) throw new BadRequestException('notificationId is required');

    await this.enforceRateLimit(request, 'notifications:read', `${user.uid}:${notificationId}`, 80);

    const snap = await this.findNotificationDocument(notificationId, user.uid);
    if (!snap?.exists) throw new NotFoundException('Notification not found');

    const targetUserId = this.notificationOwnerId(snap, user);
    if (!targetUserId) throw new ForbiddenException('Invalid notification owner');

    this.ensureUserAccess(user, targetUserId);

    await snap.ref.set({ read: true, readAt: new Date(), updatedAt: new Date() }, { merge: true });
    return { success: true };
  }

  async markAllRead(request: Request, user: RequestUser, userId: string) {
    this.assertAuth(user);
    const normalizedUserId = userId?.trim();
    if (!normalizedUserId) throw new BadRequestException('userId is required');

    this.ensureUserAccess(user, normalizedUserId);
    await this.enforceRateLimit(request, 'notifications:read-all', `${user.uid}:${normalizedUserId}`, 20);

    const [nestedSnap, legacySnap] = await Promise.all([
      this.userNotificationsCollection(normalizedUserId)
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
    this.assertAuth(user);
    if (!notificationId?.trim()) throw new BadRequestException('notificationId is required');

    await this.enforceRateLimit(request, 'notifications:delete', `${user.uid}:${notificationId}`, 40);

    const snap = await this.findNotificationDocument(notificationId, user.uid);
    if (!snap?.exists) throw new NotFoundException('Notification not found');

    const targetUserId = this.notificationOwnerId(snap, user);
    if (!targetUserId) throw new ForbiddenException('Invalid notification owner');

    this.ensureUserAccess(user, targetUserId);

    await snap.ref.delete();
    return { success: true };
  }
}
