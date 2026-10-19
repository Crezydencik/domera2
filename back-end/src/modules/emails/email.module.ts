import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailController } from './controllers/email.controller';
import { MailingCronController, MailingResumeJob } from './jobs/mailing-cron';
import { EmailLogService } from './services/email-log.service';
import { EmailService } from './services/email.service';
import { EmailTemplateService } from './services/email-template.service';
import { EmailTransportService } from './services/email-transport.service';

@Module({
  imports: [ConfigModule],
  controllers: [EmailController, MailingCronController],
  providers: [EmailService, EmailLogService, EmailTemplateService, EmailTransportService, MailingResumeJob],
  exports: [EmailService, EmailLogService],
})
export class EmailModule {}
