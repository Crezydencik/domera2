import { IsBoolean, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PASSWORD_COMPLEXITY_MESSAGE, PASSWORD_COMPLEXITY_REGEX } from '../../../common/auth/password-policy';

export class AcceptInvitationDto {
  @ApiPropertyOptional({ description: 'Invitation token for public acceptance flow.' })
  @IsOptional()
  @IsString()
  token?: string;

  @ApiPropertyOptional({ description: 'Invitation id for acceptance flow.' })
  @IsOptional()
  @IsString()
  invitationId?: string;

  @ApiPropertyOptional({ description: 'Password for registration flow.', minLength: 8 })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @Matches(PASSWORD_COMPLEXITY_REGEX, { message: PASSWORD_COMPLEXITY_MESSAGE })
  password?: string;

  @ApiProperty({ description: 'GDPR consent confirmation.', type: Boolean })
  @IsBoolean()
  gdprConsent!: boolean;
}
