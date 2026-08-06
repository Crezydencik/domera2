import { Request } from 'express';
import { RequestUser } from '../../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { NotificationAccessService } from './notification-access.service';
import { NotificationRepositoryService } from './notification-repository.service';
export declare class NotificationStateService {
    private readonly firebaseAdminService;
    private readonly accessService;
    private readonly repositoryService;
    constructor(firebaseAdminService: FirebaseAdminService, accessService: NotificationAccessService, repositoryService: NotificationRepositoryService);
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
