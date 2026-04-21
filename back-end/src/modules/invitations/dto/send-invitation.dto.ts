import { IsEmail, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendInvitationDto {
  @ApiProperty({ description: 'Apartment id that the resident invitation belongs to.' })
  @IsString()
  apartmentId!: string;

  @ApiProperty({ description: 'Invitee email address.' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ description: 'Optional invitation type, e.g. renter.' })
  @IsOptional()
  @IsString()
  inviteType?: string;
}
