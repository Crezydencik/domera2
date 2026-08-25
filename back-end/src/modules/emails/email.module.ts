import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailController } from './controllers/email.controller';
import { EmailLogService } from './services/email-log.service';
import { EmailService } from './services/email.service';
import { EmailTemplateService } from './services/email-template.service';
import { EmailTransportService } from './services/email-transport.service';

@Module({
  imports: [ConfigModule],
  controllers: [EmailController],
  providers: [EmailService, EmailLogService, EmailTemplateService, EmailTransportService],
  exports: [EmailService, EmailLogService],
})
export class EmailModule {}
