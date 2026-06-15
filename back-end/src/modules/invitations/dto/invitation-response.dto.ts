import { ApiProperty } from '@nestjs/swagger';

export class InvitationSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ nullable: true })
  apartmentId!: string | null;

  @ApiProperty({ required: false })
  apartmentLabel?: string;

  @ApiProperty({ required: false })
  buildingLabel?: string;

  @ApiProperty({ required: false })
  managerLabel?: string;

  @ApiProperty({ required: false, example: 'resident' })
  inviteType?: string;

  @ApiProperty({ required: false, example: 'Resident' })
  accountType?: string;

  @ApiProperty({ required: false })
  firstName?: string;

  @ApiProperty({ required: false })
  lastName?: string;

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
