import { BadRequestException, Controller, Get, Post, Body, HttpCode, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import { FirebaseAuthGuard } from '../../../common/auth/firebase-auth.guard';
import { RequestUser } from '../../../common/auth/request-user.type';
import { isPlatformAdminRole } from '../../../common/auth/role.constants';
import { Roles } from '../../../common/auth/roles.decorator';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { EmailLogService, EmailLogType } from '../services/email-log.service';
import { EmailService } from '../services/email.service';
import { EmailTemplateService } from '../services/email-template.service';
import {
  SendRegistrationCodeEmailDto,
  SendPasswordResetEmailDto,
  SendOwnerInvitationEmailDto,
  SendTenantInvitationEmailDto,
  SendTenantInvitedByOwnerEmailDto,
  SendInvoiceGeneratedEmailDto,
  SendMeterReadingReminderEmailDto,
  SendNotificationEmailDto,
} from '../dto/send-email.dto';
import { EmailLanguage } from '../email.types';

type EmailTemplatePreviewType =
  | 'registrationCode'
  | 'passwordReset'
  | 'ownerInvitation'
  | 'tenantInvitation'
  | 'tenantInvitedByOwner'
  | 'invoiceGenerated'
  | 'meterReadingReminder'
  | 'meterReadingClosingReminder'
  | 'notification';

@ApiTags('emails')
@Controller('emails')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('ManagementCompany', 'Accountant')
export class EmailController {
  constructor(
    private readonly emailService: EmailService,
    private readonly emailLogService: EmailLogService,
    private readonly templateService: EmailTemplateService,
  ) {}

  @Get('templates/preview')
  @Roles('PlatformAdmin', 'ManagementCompany', 'Accountant', 'Resident', 'Landlord')
  @ApiOperation({ summary: 'Preview an email template without sending it' })
  @ApiResponse({ status: 200, description: 'Email template preview returned successfully' })
  previewTemplate(
    @Query('type') type?: EmailTemplatePreviewType,
    @Query('language') language?: EmailLanguage,
  ) {
    const normalizedLanguage = language === 'en' || language === 'ru' || language === 'lv' ? language : 'lv';
    const normalizedType = this.normalizePreviewType(type);
    const template = this.buildPreviewTemplate(normalizedType, normalizedLanguage);

    return {
      type: normalizedType,
      language: normalizedLanguage,
      subject: template.subject,
      html: template.html,
    };
  }

  @Get('stats')
  @Roles('PlatformAdmin', 'ManagementCompany', 'Accountant')
  @ApiOperation({ summary: 'Get email delivery statistics' })
  @ApiResponse({ status: 200, description: 'Email statistics returned successfully' })
  async stats(
    @CurrentUser() user: RequestUser,
    @Query('type') type?: EmailLogType,
    @Query('companyId') companyId?: string,
    @Query('buildingId') buildingId?: string,
    @Query('apartmentId') apartmentId?: string,
  ) {
    const normalizedType = this.normalizeStatsType(type);
    const scopedCompanyId = isPlatformAdminRole(user.role)
      ? this.cleanString(companyId)
      : this.cleanString(user.companyId);

    if (!isPlatformAdminRole(user.role) && !scopedCompanyId) {
      throw new BadRequestException('Company ID not found for this user');
    }

    return this.emailLogService.getStats({
      type: normalizedType,
      companyId: scopedCompanyId,
      buildingId: this.cleanString(buildingId),
      apartmentId: this.cleanString(apartmentId),
    });
  }

  @Get('deliveries')
  @Roles('PlatformAdmin', 'ManagementCompany', 'Accountant')
  @ApiOperation({ summary: 'Get email delivery log items' })
  @ApiResponse({ status: 200, description: 'Email delivery log returned successfully' })
  async deliveries(
    @CurrentUser() user: RequestUser,
    @Query('type') type?: EmailLogType,
    @Query('companyId') companyId?: string,
    @Query('buildingId') buildingId?: string,
    @Query('apartmentId') apartmentId?: string,
    @Query('deliveryKeyPrefix') deliveryKeyPrefix?: string,
    @Query('limit') limit?: string,
  ) {
    const normalizedType = this.normalizeStatsType(type);
    const scopedCompanyId = isPlatformAdminRole(user.role)
      ? this.cleanString(companyId)
      : this.cleanString(user.companyId);

    if (!isPlatformAdminRole(user.role) && !scopedCompanyId) {
      throw new BadRequestException('Company ID not found for this user');
    }

    return this.emailLogService.getDeliveries({
      type: normalizedType,
      companyId: scopedCompanyId,
      buildingId: this.cleanString(buildingId),
      apartmentId: this.cleanString(apartmentId),
      deliveryKeyPrefix: this.cleanString(deliveryKeyPrefix),
      limit: this.cleanNumber(limit, 200),
    });
  }

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

  private normalizePreviewType(type?: string): EmailTemplatePreviewType {
    const allowed: EmailTemplatePreviewType[] = [
      'registrationCode',
      'passwordReset',
      'ownerInvitation',
      'tenantInvitation',
      'tenantInvitedByOwner',
      'invoiceGenerated',
      'meterReadingReminder',
      'meterReadingClosingReminder',
      'notification',
    ];

    return allowed.includes(type as EmailTemplatePreviewType) ? type as EmailTemplatePreviewType : 'meterReadingReminder';
  }

  private normalizeStatsType(type?: string): EmailLogType | undefined {
    const allowed: EmailLogType[] = [
      'registrationCode',
      'passwordReset',
      'ownerInvitation',
      'tenantInvitation',
      'tenantInvitedByOwner',
      'invoiceGenerated',
      'meterReadingReminder',
      'notification',
    ];

    return allowed.includes(type as EmailLogType) ? type as EmailLogType : undefined;
  }

  private cleanString(value?: string): string | undefined {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    return trimmed || undefined;
  }

  private cleanNumber(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
  }

  private buildPreviewTemplate(type: EmailTemplatePreviewType, language: EmailLanguage) {
    const sampleLink = 'https://domera.example/app';

    switch (type) {
      case 'registrationCode':
        return this.templateService.registrationCode({ to: 'resident@example.com', code: '482913', language });
      case 'passwordReset':
        return this.templateService.passwordReset({ to: 'resident@example.com', resetLink: sampleLink, language });
      case 'ownerInvitation':
        return this.templateService.ownerInvitation({
          to: 'owner@example.com',
          ownerName: 'Marta Ozola',
          ownerEmail: 'owner@example.com',
          companyName: 'Domera Management',
          invitationLink: sampleLink,
          buildingName: 'Brivibas 10',
          apartmentNumber: '24',
          language,
        });
      case 'tenantInvitation':
        return this.templateService.tenantInvitation({
          to: 'tenant@example.com',
          companyName: 'Domera Management',
          invitationLink: sampleLink,
          buildingName: 'Brivibas 10',
          apartmentNumber: '24',
          senderName: 'Marta Ozola',
          language,
        });
      case 'tenantInvitedByOwner':
        return this.templateService.tenantInvitedByOwner({
          to: 'tenant@example.com',
          tenantName: 'Janis Berzins',
          brandName: 'Domera Management',
          ownerName: 'Marta Ozola',
          invitationLink: sampleLink,
          buildingName: 'Brivibas 10',
          apartmentNumber: '24',
          language,
        });
      case 'invoiceGenerated':
        return this.templateService.invoiceGenerated({
          to: 'resident@example.com',
          tenantName: 'Janis Berzins',
          brandName: 'Domera Management',
          apartmentNumber: '24',
          buildingName: 'Brivibas 10',
          invoiceNumber: 'INV-2026-0007',
          amount: '128.45 EUR',
          dueDate: '31.08.2026',
          invoiceLink: sampleLink,
          language,
        });
      case 'notification':
        return this.templateService.notification({
          to: 'resident@example.com',
          title: 'Domera notification',
          message: 'A new document has been added for your apartment.',
          actionLabel: 'Open Domera',
          actionLink: sampleLink,
          brandName: 'Domera',
          footer: 'This is a preview message.',
          language,
        });
      case 'meterReadingReminder':
        return this.templateService.meterReadingReminder({
          to: 'resident@example.com',
          tenantName: 'Janis Berzins',
          brandName: 'Domera Management',
          apartmentNumber: '24',
          buildingName: 'Brivibas 10',
          submissionLink: sampleLink,
          periodLabel: '01.08.2026 - 31.08.2026',
          deadline: '31.08.2026',
          reminderStage: 'start',
          language,
        });
      case 'meterReadingClosingReminder':
      default:
        return this.templateService.meterReadingReminder({
          to: 'resident@example.com',
          tenantName: 'Janis Berzins',
          brandName: 'Domera Management',
          apartmentNumber: '24',
          buildingName: 'Brivibas 10',
          submissionLink: sampleLink,
          periodLabel: '01.08.2026 - 31.08.2026',
          deadline: '31.08.2026',
          reminderStage: 'close',
          daysUntilDeadline: 0,
          language,
        });
    }
  }
}
