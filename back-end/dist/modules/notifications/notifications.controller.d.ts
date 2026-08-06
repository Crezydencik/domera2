import { Request } from 'express';
import { RequestUser } from '../../common/auth/request-user.type';
import { NotificationsService } from './services/notifications.service';
export declare class NotificationsController {
    private readonly notificationsService;
    constructor(notificationsService: NotificationsService);
    getSettings(request: Request, user: RequestUser): Promise<{
        settings: import("./types/notification.types").NotificationSettings;
    }>;
    updateSettings(request: Request, user: RequestUser, body: Record<string, unknown>): Promise<{
        success: boolean;
        settings: import("./types/notification.types").NotificationSettings;
    }>;
    list(request: Request, user: RequestUser, userId: string): Promise<{
        items: ({
            id: string;
        } & Record<string, unknown>)[];
    }>;
    create(request: Request, user: RequestUser, body: Record<string, unknown>): Promise<{
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
