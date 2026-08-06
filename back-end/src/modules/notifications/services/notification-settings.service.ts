import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { RequestUser } from '../../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { defaultNotificationSettings, NotificationSettings } from '../types/notification.types';
import { NotificationAccessService } from './notification-access.service';

@Injectable()
export class NotificationSettingsService {
  constructor(
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly accessService: NotificationAccessService,
  ) {}

  async getSettings(request: Request, user: RequestUser) {
    this.accessService.assertAuth(user);
    await this.accessService.enforceRateLimit(request, 'notifications:settings:get', user.uid, 80);

    const settings = await this.getUserNotificationSettings(user.uid);
    return { settings };
  }

  async updateSettings(request: Request, user: RequestUser, payload: Record<string, unknown>) {
    this.accessService.assertAuth(user);
    await this.accessService.enforceRateLimit(request, 'notifications:settings:update', user.uid, 40);

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

  async getUserNotificationSettings(userId: string): Promise<NotificationSettings> {
    const snap = await this.firebaseAdminService.firestore.collection('users').doc(userId).get();
    if (!snap.exists) return defaultNotificationSettings;

    const data = snap.data() as Record<string, unknown>;
    return this.normalizeSettings(data.notificate ?? data.notificationSettings);
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
}
