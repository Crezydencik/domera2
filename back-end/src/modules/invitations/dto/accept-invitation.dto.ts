import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AcceptInvitationDto {
  @ApiPropertyOptional({ description: 'Invitation token for public acceptance flow.' })
  @IsOptional()
  @IsString()
  token?: string;

  @ApiPropertyOptional({ description: 'Invitation id for acceptance flow.' })
  @IsOptional()
  @IsString()
  invitationId?: string;

  @ApiPropertyOptional({ description: 'Password for registration flow.', minLength: 6 })
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @ApiProperty({ description: 'GDPR consent confirmation.', type: Boolean })
  @IsBoolean()
  gdprConsent!: boolean;
}
