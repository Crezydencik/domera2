import { ApiProperty } from '@nestjs/swagger';

export class ImportApartmentsResultsDto {
  @ApiProperty()
  imported!: number;

  @ApiProperty({ type: [String] })
  errors!: string[];

  @ApiProperty({ type: [String] })
  skippedDuplicates!: string[];

  @ApiProperty({ type: [String] })
  createdApartments!: string[];
}

export class ImportApartmentsResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ type: ImportApartmentsResultsDto })
  results!: ImportApartmentsResultsDto;
}
