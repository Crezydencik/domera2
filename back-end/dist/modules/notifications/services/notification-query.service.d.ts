import { Request } from 'express';
import { RequestUser } from '../../../common/auth/request-user.type';
import { NotificationAccessService } from './notification-access.service';
import { NotificationRepositoryService } from './notification-repository.service';
import { NotificationSettingsService } from './notification-settings.service';
export declare class NotificationQueryService {
    private readonly accessService;
    private readonly repositoryService;
    private readonly settingsService;
    constructor(accessService: NotificationAccessService, repositoryService: NotificationRepositoryService, settingsService: NotificationSettingsService);
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
}
