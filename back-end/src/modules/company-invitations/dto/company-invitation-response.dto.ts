import { ApiProperty } from '@nestjs/swagger';

export class CompanyInvitationItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  companyId!: string;

  @ApiProperty()
  buildingId!: string;

  @ApiProperty({ example: 'ManagementCompany' })
  role!: string;

  @ApiProperty({ example: 'pending' })
  status!: string;
}

export class CompanyInvitationListResponseDto {
  @ApiProperty({ type: [CompanyInvitationItemDto] })
  invitations!: CompanyInvitationItemDto[];
}

export class CompanyInvitationMutationResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ required: false })
  invitationId?: string;
}
