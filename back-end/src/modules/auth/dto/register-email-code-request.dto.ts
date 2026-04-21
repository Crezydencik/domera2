import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class RegisterEmailCodeRequestDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ enum: ['en', 'ru', 'lv'] })
  @IsOptional()
  @IsString()
  locale?: string;
}
