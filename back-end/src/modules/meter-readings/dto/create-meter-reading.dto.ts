import { IsBoolean, IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';
import { METER_READING_KEY_PATTERN, MeterReadingKey } from '../types/meter-reading.types';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMeterReadingDto {
  @ApiProperty({ description: 'Apartment id where the reading belongs.' })
  @IsString()
  apartmentId!: string;

  @ApiProperty({ description: 'Meter id.' })
  @IsString()
  meterId!: string;

  @ApiPropertyOptional({
    example: 'coldmeterwater',
    description: 'Optional meter group key: coldmeterwater, hotmeterwater, electricitymeter; extra water meters — coldmeterwater_2 … coldmeterwater_9, hotmeterwater_2 … hotmeterwater_9.',
  })
  @IsOptional()
  @Matches(METER_READING_KEY_PATTERN, { message: 'meterKey must be a meter group key' })
  meterKey?: MeterReadingKey;

  @ApiPropertyOptional({ description: 'Electricity meter digit count.' })
  @IsOptional()
  @IsNumber()
  @Min(5)
  meterDigits?: number;

  @ApiProperty({ description: 'Previous meter value.' })
  @IsNumber()
  previousValue!: number;

  @ApiProperty({ description: 'Current meter value.' })
  @IsNumber()
  currentValue!: number;

  @ApiProperty({ description: 'Calculated consumption.' })
  @IsNumber()
  consumption!: number;

  @ApiProperty({ description: 'Building id.' })
  @IsString()
  buildingId!: string;

  @ApiPropertyOptional({ description: 'Reading month.' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  month?: number;

  @ApiPropertyOptional({ description: 'Reading year.' })
  @IsOptional()
  @IsNumber()
  @Min(2000)
  year?: number;

  @ApiPropertyOptional({ description: 'Internal reading source.' })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ description: 'Internal meter reading source.' })
  @IsOptional()
  @IsString()
  meterReadingSource?: string;

  @ApiPropertyOptional({ description: 'Linked invoice id.' })
  @IsOptional()
  @IsString()
  linkedInvoiceId?: string;

  @ApiPropertyOptional({ description: 'Linked invoice external id.' })
  @IsOptional()
  @IsString()
  linkedInvoiceExternalId?: string;

  @ApiPropertyOptional({ description: 'Allow multiple readings for the same month.' })
  @IsOptional()
  @IsBoolean()
  allowMultipleMonthly?: boolean;
}
