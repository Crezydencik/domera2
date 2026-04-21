import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ImportApartmentsDto {
  @ApiProperty({ description: 'Target building id for the import.' })
  @IsString()
  buildingId!: string;

  @ApiProperty({ description: 'Target company id used for tenant ownership validation.' })
  @IsString()
  companyId!: string;
}
