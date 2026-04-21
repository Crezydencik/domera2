import { ApiProperty } from '@nestjs/swagger';

export class InvitationSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ nullable: true })
  apartmentId!: string | null;

  @ApiProperty({ example: 'pending' })
  status!: string;

  @ApiProperty({ nullable: true, example: '2026-04-19T12:00:00.000Z' })
  expiresAt!: string | null;
}

export class SendInvitationResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty()
  invitationId!: string;

  @ApiProperty()
  invitationLink!: string;
}

export class ResolveInvitationResponseDto {
  @ApiProperty({ type: InvitationSummaryDto })
  invitation!: InvitationSummaryDto;

  @ApiProperty({ example: false })
  existingAccountDetected!: boolean;
}

export class AcceptInvitationResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 'authenticated' })
  mode!: 'authenticated' | 'registration';
}
