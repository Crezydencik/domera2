import { Module } from '@nestjs/common';
import { EmailModule } from '../emails/email.module';
import { MeterReadingsController } from './controllers/meter-readings.controller';
import { MeterReadingReminderJob } from './jobs/meter-reading-reminder.job';
import { ElectricityPaymentService } from './services/electricity-payment.service';
import { MeterReadingAccessService } from './services/meter-reading-access.service';
import { MeterReadingBuildingService } from './services/meter-reading-building.service';
import { MeterReadingCrudService } from './services/meter-reading-crud.service';
import { MeterReadingHelperService } from './services/meter-reading-helper.service';
import { MeterReadingQueryService } from './services/meter-reading-query.service';
import { MeterReadingReminderService } from './services/meter-reading-reminder.service';
import { MeterReadingsService } from './services/meter-readings.service';

@Module({
  imports: [EmailModule],
  controllers: [MeterReadingsController],
  providers: [
    MeterReadingsService,
    MeterReadingAccessService,
    MeterReadingHelperService,
    MeterReadingBuildingService,
    MeterReadingQueryService,
    MeterReadingCrudService,
    ElectricityPaymentService,
    MeterReadingReminderService,
    MeterReadingReminderJob,
  ],
})
export class MeterReadingsModule {}
