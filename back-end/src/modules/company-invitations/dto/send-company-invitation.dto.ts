import { IsEmail, IsIn, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendCompanyInvitationDto {
  @ApiProperty({ description: 'Invitee email.' })
  @IsEmail()
  email!: string;

  @ApiProperty({ description: 'Company id the invite belongs to.' })
  @IsString()
  companyId!: string;

  @ApiProperty({ description: 'Building id the invite is scoped to.' })
  @IsString()
  buildingId!: string;

  @ApiProperty({ enum: ['Accountant', 'ManagementCompany'], description: 'Role granted by invitation.' })
  @IsIn(['Accountant', 'ManagementCompany'])
  role!: 'Accountant' | 'ManagementCompany';

  @ApiPropertyOptional({ description: 'Optional building display name.' })
  @IsOptional()
  @IsString()
  buildingName?: string;
}
