import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MeterReadingItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  apartmentId!: string;

  @ApiPropertyOptional({ description: 'Human-readable apartment number' })
  apartmentNumber?: string;

  @ApiPropertyOptional()
  buildingId?: string;

  @ApiPropertyOptional()
  buildingName?: string;

  @ApiPropertyOptional()
  buildingAddress?: string;

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

  @ApiPropertyOptional({ description: 'ISO 8601 timestamp' })
  submittedAt?: string | Date;

  @ApiPropertyOptional({ example: '98063287' })
  serialNumber?: string;

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
