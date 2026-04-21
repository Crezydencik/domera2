import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MeterReadingItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  apartmentId!: string;

  @ApiProperty()
  meterId!: string;

  @ApiProperty()
  previousValue!: number;

  @ApiProperty()
  currentValue!: number;

  @ApiProperty()
  consumption!: number;

  @ApiProperty()
  month!: number;

  @ApiProperty()
  year!: number;

  @ApiPropertyOptional({ example: 'coldmeterwater' })
  meterKey?: string;
}

export class MeterReadingListResponseDto {
  @ApiProperty({ type: [MeterReadingItemDto] })
  items!: MeterReadingItemDto[];
}

export class MeterReadingCreateResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ type: MeterReadingItemDto })
  reading!: MeterReadingItemDto;
}
