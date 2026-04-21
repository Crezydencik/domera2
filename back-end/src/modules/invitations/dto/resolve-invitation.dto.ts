import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResolveInvitationDto {
  @ApiProperty({ description: 'Invitation token to resolve.', minLength: 8 })
  @IsString()
  @MinLength(8)
  token!: string;
}
