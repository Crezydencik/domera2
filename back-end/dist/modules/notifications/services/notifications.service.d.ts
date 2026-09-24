import { Request } from 'express';
import { RequestUser } from '../../../common/auth/request-user.type';
import { NotificationQueryService } from './notification-query.service';
import { NotificationSettingsService } from './notification-settings.service';
import { NotificationStateService } from './notification-state.service';
export declare class NotificationsService {
    private readonly settingsService;
    private readonly queryService;
    private readonly stateService;
    constructor(settingsService: NotificationSettingsService, queryService: NotificationQueryService, stateService: NotificationStateService);
    getSettings(request: Request, user: RequestUser): Promise<{
        settings: import("../types/notification.types").NotificationSettings;
    }>;
    updateSettings(request: Request, user: RequestUser, payload: Record<string, unknown>): Promise<{
        success: boolean;
        settings: import("../types/notification.types").NotificationSettings;
    }>;
    list(request: Request, user: RequestUser, userId: string): Promise<{
        items: ({
            id: string;
        } & Record<string, unknown>)[];
    }>;
    create(request: Request, user: RequestUser, payload: Record<string, unknown>): Promise<{
        notificationId: string;
        userId: string;
        read: boolean;
        createdAt: Date;
        id: string;
    }>;
    markRead(request: Request, user: RequestUser, notificationId: string): Promise<{
        success: boolean;
    }>;
    markAllRead(request: Request, user: RequestUser, userId: string): Promise<{
        success: boolean;
        updated: number;
    }>;
    remove(request: Request, user: RequestUser, notificationId: string): Promise<{
        success: boolean;
    }>;
}
