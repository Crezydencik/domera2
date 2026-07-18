import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMeterReadingDto {
  @ApiProperty({ description: 'Apartment id where the reading belongs.' })
  @IsString()
  apartmentId!: string;

  @ApiProperty({ description: 'Meter id.' })
  @IsString()
  meterId!: string;

  @ApiPropertyOptional({ enum: ['coldmeterwater', 'hotmeterwater', 'electricitymeter'], description: 'Optional meter group key.' })
  @IsOptional()
  @IsIn(['coldmeterwater', 'hotmeterwater', 'electricitymeter'])
  meterKey?: 'coldmeterwater' | 'hotmeterwater' | 'electricitymeter';

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
}
