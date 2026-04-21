import { IsObject, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateMeterReadingDto {
  @ApiProperty({ description: 'Apartment id containing the reading.' })
  @IsString()
  apartmentId!: string;

  @ApiProperty({
    description: 'Partial reading data object to merge into existing reading.',
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  data!: Record<string, unknown>;
}
