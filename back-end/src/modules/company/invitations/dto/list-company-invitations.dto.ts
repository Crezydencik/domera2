import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ListCompanyInvitationsDto {
  @ApiProperty({ description: 'Company id filter.' })
  @IsString()
  companyId!: string;

  @ApiProperty({ description: 'Building id filter.' })
  @IsString()
  buildingId!: string;
}
