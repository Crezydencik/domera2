import { Request } from 'express';
import { RequestUser } from '../../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { NotificationSettings } from '../types/notification.types';
import { NotificationAccessService } from './notification-access.service';
export declare class NotificationSettingsService {
    private readonly firebaseAdminService;
    private readonly accessService;
    constructor(firebaseAdminService: FirebaseAdminService, accessService: NotificationAccessService);
    getSettings(request: Request, user: RequestUser): Promise<{
        settings: NotificationSettings;
    }>;
    updateSettings(request: Request, user: RequestUser, payload: Record<string, unknown>): Promise<{
        success: boolean;
        settings: NotificationSettings;
    }>;
    getUserNotificationSettings(userId: string): Promise<NotificationSettings>;
    private normalizeSettings;
}
