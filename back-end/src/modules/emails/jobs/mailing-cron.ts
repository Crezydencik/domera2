import { Controller, Get, Headers, HttpCode, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ApiExcludeController } from '@nestjs/swagger';
import { assertCronSecret } from '../../../common/security/cron-secret';
import { EmailService } from '../services/email.service';

/** In-process trigger (long-running server). Set MAILING_CRON_DISABLED=true on Vercel. */
@Injectable()
export class MailingResumeJob {
  private readonly logger = new Logger(MailingResumeJob.name);
  private running = false;

  constructor(private readonly emailService: EmailService) {}

  @Cron('* * * * *')
  async tick() {
    if (process.env.MAILING_CRON_DISABLED === 'true' || this.running) return;
    this.running = true;
    try {
      await this.emailService.resumePendingMailings();
    } catch (error) {
      this.logger.warn(`mailing.resume.failed reason=${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.running = false;
    }
  }
}

/** HTTP trigger for Vercel Cron: GET /api/internal/cron/information-mailings (Bearer CRON_SECRET). */
@ApiExcludeController()
@Controller('internal/cron')
export class MailingCronController {
  constructor(private readonly emailService: EmailService) {}

  @Get('information-mailings')
  @HttpCode(200)
  async informationMailings(@Headers('authorization') authorization?: string) {
    assertCronSecret(authorization);
    return this.emailService.resumePendingMailings();
  }
}
