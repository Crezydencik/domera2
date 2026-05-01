import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { ACCOUNT_TYPES } from '../../../common/auth/role.constants';
import { PASSWORD_COMPLEXITY_MESSAGE, PASSWORD_COMPLEXITY_REGEX } from '../../../common/auth/password-policy';

export class RegisterDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({ description: 'Verification token issued after confirming the email code' })
  @IsString()
  verificationToken!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @Matches(PASSWORD_COMPLEXITY_REGEX, { message: PASSWORD_COMPLEXITY_MESSAGE })
  password!: string;

  @ApiProperty({ enum: ACCOUNT_TYPES })
  @IsString()
  @IsIn([...ACCOUNT_TYPES])
  accountType!: string;

  @ApiProperty({ description: 'Confirms that the user accepted the privacy policy' })
  @IsBoolean()
  acceptedPrivacyPolicy!: boolean;

  @ApiProperty({ description: 'Confirms that the user accepted the terms of use' })
  @IsBoolean()
  acceptedTerms!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  companyName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  companyEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  registrationNumber?: string;
}
