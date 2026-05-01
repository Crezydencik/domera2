export { EmailModule } from './email.module';
export { EmailService } from './email.service';
export { EmailController } from './email.controller';
export { EmailType, type EmailLanguage, type EmailTemplate, type EmailPayload } from './email.types';
export {
  SendEmailDto,
  SendRegistrationCodeEmailDto,
  SendPasswordResetEmailDto,
  SendOwnerInvitationEmailDto,
  SendTenantInvitationEmailDto,
  SendTenantInvitedByOwnerEmailDto,
  SendInvoiceGeneratedEmailDto,
  SendMeterReadingReminderEmailDto,
  SendNotificationEmailDto,
} from './dto/send-email.dto';
