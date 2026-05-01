import { Module } from '@nestjs/common';
import { MeterReadingsController } from './meter-readings.controller';
import { MeterReadingsService } from './meter-readings.service';
import { MeterReadingReminderJob } from './meter-reading-reminder.job';
import { EmailModule } from '../emails/email.module';

@Module({
  imports: [EmailModule],
  controllers: [MeterReadingsController],
  providers: [MeterReadingsService, MeterReadingReminderJob],
})
export class MeterReadingsModule {}
