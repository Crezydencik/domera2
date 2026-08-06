import { Module } from '@nestjs/common';
import { BuildingCreationAccessController } from './controllers/building-creation-access.controller';
import { BuildingsAdminController } from './controllers/buildings-admin.controller';
import { BuildingsCrudController } from './controllers/buildings-crud.controller';
import { BuildingsService } from './buildings.service';
import { BuildingAdminService } from './services/building-admin.service';
import { BuildingCreationRequestService } from './services/building-creation-request.service';
import { BuildingCrudService } from './services/building-crud.service';
import { BuildingPayloadService } from './services/building-payload.service';
import { BuildingPlatformBillingService } from './services/building-platform-billing.service';
import { BuildingPlatformNotificationService } from './services/building-platform-notification.service';
import { BuildingStatsService } from './services/building-stats.service';
import { BuildingStorageService } from './services/building-storage.service';

@Module({
  controllers: [
    BuildingCreationAccessController,
    BuildingsAdminController,
    BuildingsCrudController,
  ],
  providers: [
    BuildingsService,
    BuildingAdminService,
    BuildingCreationRequestService,
    BuildingCrudService,
    BuildingPayloadService,
    BuildingPlatformBillingService,
    BuildingPlatformNotificationService,
    BuildingStatsService,
    BuildingStorageService,
  ],
  exports: [BuildingsService],
})
export class BuildingsModule {}
