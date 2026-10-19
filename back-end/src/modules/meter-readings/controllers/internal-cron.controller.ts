import { Controller, Get, Headers, HttpCode } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { assertCronSecret } from '../../../common/security/cron-secret';
import { MeterReadingReminderJob } from '../jobs/meter-reading-reminder.job';

/**
 * HTTP trigger for schedulers that cannot keep a process alive (Vercel Cron, Cloud Scheduler).
 * Disabled (404) when CRON_SECRET is not configured.
 */
@ApiExcludeController()
@Controller('internal/cron')
export class InternalCronController {
  constructor(private readonly reminderJob: MeterReadingReminderJob) {}

  @Get('meter-reading-reminders')
  @HttpCode(200)
  async meterReadingReminders(@Headers('authorization') authorization?: string) {
    assertCronSecret(authorization);
    return this.reminderJob.sendConfiguredReminders();
  }
}
