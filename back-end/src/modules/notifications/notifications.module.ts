import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { NotificationsController } from './notifications.controller';
import { NotificationAccessService } from './services/notification-access.service';
import { NotificationQueryService } from './services/notification-query.service';
import { NotificationRepositoryService } from './services/notification-repository.service';
import { NotificationSettingsService } from './services/notification-settings.service';
import { NotificationStateService } from './services/notification-state.service';
import { NotificationsService } from './services/notifications.service';

@Module({
  imports: [CommonModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationAccessService,
    NotificationRepositoryService,
    NotificationSettingsService,
    NotificationQueryService,
    NotificationStateService,
  ],
})
export class NotificationsModule {}
