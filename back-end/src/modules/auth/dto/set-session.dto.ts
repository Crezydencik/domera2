import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SetSessionDto {
  @ApiProperty({ description: 'Firebase ID token used to mint a secure session cookie.' })
  @IsString()
  @MinLength(10)
  idToken!: string;

  @ApiPropertyOptional({ description: 'Optional user id expected to match token subject.' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: 'Optional email expected to match token subject.' })
  @IsOptional()
  @IsEmail()
  email?: string;
}
