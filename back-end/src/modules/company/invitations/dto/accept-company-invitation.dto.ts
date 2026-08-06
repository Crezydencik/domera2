import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AcceptCompanyInvitationDto {
  @ApiProperty({ description: 'Company invitation id to accept.' })
  @IsString()
  invitationId!: string;
}
