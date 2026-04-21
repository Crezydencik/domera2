import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class PreviewPasswordResetDto {
  @ApiProperty()
  @IsString()
  oobCode!: string;
}
