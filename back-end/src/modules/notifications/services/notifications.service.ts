import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { RequestUser } from '../../../common/auth/request-user.type';
import { NotificationQueryService } from './notification-query.service';
import { NotificationSettingsService } from './notification-settings.service';
import { NotificationStateService } from './notification-state.service';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly settingsService: NotificationSettingsService,
    private readonly queryService: NotificationQueryService,
    private readonly stateService: NotificationStateService,
  ) {}

  getSettings(request: Request, user: RequestUser) {
    return this.settingsService.getSettings(request, user);
  }

  updateSettings(request: Request, user: RequestUser, payload: Record<string, unknown>) {
    return this.settingsService.updateSettings(request, user, payload);
  }

  list(request: Request, user: RequestUser, userId: string) {
    return this.queryService.list(request, user, userId);
  }

  create(request: Request, user: RequestUser, payload: Record<string, unknown>) {
    return this.queryService.create(request, user, payload);
  }

  markRead(request: Request, user: RequestUser, notificationId: string) {
    return this.stateService.markRead(request, user, notificationId);
  }

  markAllRead(request: Request, user: RequestUser, userId: string) {
    return this.stateService.markAllRead(request, user, userId);
  }

  remove(request: Request, user: RequestUser, notificationId: string) {
    return this.stateService.remove(request, user, notificationId);
  }
}
