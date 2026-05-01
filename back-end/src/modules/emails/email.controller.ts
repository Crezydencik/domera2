import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { EmailService } from './email.service';
import {
  SendRegistrationCodeEmailDto,
  SendPasswordResetEmailDto,
  SendOwnerInvitationEmailDto,
  SendTenantInvitationEmailDto,
  SendTenantInvitedByOwnerEmailDto,
  SendInvoiceGeneratedEmailDto,
  SendMeterReadingReminderEmailDto,
  SendNotificationEmailDto,
} from './dto/send-email.dto';

@ApiTags('emails')
@Controller('api/emails')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Post('registration-code')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send registration code email' })
  @ApiResponse({ status: 200, description: 'Email sent successfully' })
  async sendRegistrationCode(@Body() dto: SendRegistrationCodeEmailDto) {
    return this.emailService.sendRegistrationCode(dto);
  }

  @Post('password-reset')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send password reset email' })
  @ApiResponse({ status: 200, description: 'Email sent successfully' })
  async sendPasswordReset(@Body() dto: SendPasswordResetEmailDto) {
    return this.emailService.sendPasswordReset(dto);
  }

  @Post('owner-invitation')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send owner invitation email' })
  @ApiResponse({ status: 200, description: 'Email sent successfully' })
  async sendOwnerInvitation(@Body() dto: SendOwnerInvitationEmailDto) {
    return this.emailService.sendOwnerInvitation(dto);
  }

  @Post('tenant-invitation')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send tenant invitation email' })
  @ApiResponse({ status: 200, description: 'Email sent successfully' })
  async sendTenantInvitation(@Body() dto: SendTenantInvitationEmailDto) {
    return this.emailService.sendTenantInvitation(dto);
  }

  @Post('tenant-invited-by-owner')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send email when owner invites tenant' })
  @ApiResponse({ status: 200, description: 'Email sent successfully' })
  async sendTenantInvitedByOwner(@Body() dto: SendTenantInvitedByOwnerEmailDto) {
    return this.emailService.sendTenantInvitedByOwner(dto);
  }

  @Post('invoice-generated')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send invoice generated email' })
  @ApiResponse({ status: 200, description: 'Email sent successfully' })
  async sendInvoiceGenerated(@Body() dto: SendInvoiceGeneratedEmailDto) {
    return this.emailService.sendInvoiceGenerated(dto);
  }

  @Post('meter-reading-reminder')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send meter reading reminder email' })
  @ApiResponse({ status: 200, description: 'Email sent successfully' })
  async sendMeterReadingReminder(@Body() dto: SendMeterReadingReminderEmailDto) {
    return this.emailService.sendMeterReadingReminder(dto);
  }

  @Post('notification')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send generic notification email' })
  @ApiResponse({ status: 200, description: 'Email sent successfully' })
  async sendNotification(@Body() dto: SendNotificationEmailDto) {
    return this.emailService.sendNotification(dto);
  }
}
