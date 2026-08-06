import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class InviteTenantDto {
  @IsString()
  email!: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  contractNumber?: string;

  @IsOptional()
  @IsString()
  fromDate?: string;

  @IsOptional()
  @IsString()
  until?: string;

  @IsOptional()
  @IsBoolean()
  canViewDocuments?: boolean;
}
