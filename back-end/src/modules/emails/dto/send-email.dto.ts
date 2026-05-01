import { IsEmail, IsString, IsOptional, IsEnum } from 'class-validator';
import { EmailLanguage, EmailType } from '../email.types';

export class SendEmailDto {
  @IsEmail()
  to!: string;

  @IsString()
  subject!: string;

  @IsString()
  html!: string;
}

export class SendRegistrationCodeEmailDto {
  @IsEmail()
  to!: string;

  @IsString()
  code!: string;

  @IsOptional()
  @IsEnum(['en', 'ru', 'lv'])
  language?: EmailLanguage;
}

export class SendPasswordResetEmailDto {
  @IsEmail()
  to!: string;

  @IsString()
  resetLink!: string;

  @IsOptional()
  @IsEnum(['en', 'ru', 'lv'])
  language?: EmailLanguage;
}

export class SendOwnerInvitationEmailDto {
  @IsEmail()
  to!: string;

  @IsString()
  companyName!: string;

  @IsString()
  invitationLink!: string;

  @IsOptional()
  @IsString()
  senderName?: string;

  @IsOptional()
  @IsEnum(['en', 'ru', 'lv'])
  language?: EmailLanguage;
}

export class SendTenantInvitationEmailDto {
  @IsEmail()
  to!: string;

  @IsString()
  companyName!: string;

  @IsString()
  invitationLink!: string;

  @IsOptional()
  @IsString()
  buildingName?: string;

  @IsOptional()
  @IsString()
  apartmentNumber?: string;

  @IsOptional()
  @IsString()
  senderName?: string;

  @IsOptional()
  @IsEnum(['en', 'ru', 'lv'])
  language?: EmailLanguage;
}

export class SendTenantInvitedByOwnerEmailDto {
  @IsEmail()
  to!: string;

  @IsString()
  ownerName!: string;

  @IsString()
  invitationLink!: string;

  @IsOptional()
  @IsString()
  tenantName?: string;

  @IsOptional()
  @IsString()
  buildingName?: string;

  @IsOptional()
  @IsString()
  apartmentNumber?: string;

  @IsOptional()
  @IsEnum(['en', 'ru', 'lv'])
  language?: EmailLanguage;
}

export class SendInvoiceGeneratedEmailDto {
  @IsEmail()
  to!: string;

  @IsString()
  invoiceNumber!: string;

  @IsString()
  amount!: string;

  @IsString()
  dueDate!: string;

  @IsString()
  invoiceLink!: string;

  @IsOptional()
  @IsString()
  tenantName?: string;

  @IsOptional()
  @IsString()
  apartmentNumber?: string;

  @IsOptional()
  @IsString()
  buildingName?: string;

  @IsOptional()
  @IsEnum(['en', 'ru', 'lv'])
  language?: EmailLanguage;
}

export class SendMeterReadingReminderEmailDto {
  @IsEmail()
  to!: string;

  @IsString()
  submissionLink!: string;

  @IsOptional()
  @IsString()
  tenantName?: string;

  @IsOptional()
  @IsString()
  apartmentNumber?: string;

  @IsOptional()
  @IsString()
  buildingName?: string;

  @IsOptional()
  meters?: Array<{ name: string; lastReading?: string; unit?: string }>;

  @IsOptional()
  @IsString()
  deadline?: string;

  @IsOptional()
  @IsEnum(['en', 'ru', 'lv'])
  language?: EmailLanguage;
}

export class SendNotificationEmailDto {
  @IsEmail()
  to!: string;

  @IsString()
  title!: string;

  @IsString()
  message!: string;

  @IsOptional()
  @IsString()
  actionLabel?: string;

  @IsOptional()
  @IsString()
  actionLink?: string;

  @IsOptional()
  @IsString()
  footer?: string;

  @IsOptional()
  @IsEnum(['en', 'ru', 'lv'])
  language?: EmailLanguage;
}
