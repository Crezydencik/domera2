import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateInvoiceDto {
  @ApiProperty({ description: 'Apartment id linked to the invoice.' })
  @IsString()
  apartmentId!: string;

  @ApiProperty({ description: 'Invoice month (1-12).' })
  @IsNumber()
  @Min(1)
  month!: number;

  @ApiProperty({ description: 'Invoice year.' })
  @IsNumber()
  @Min(2000)
  year!: number;

  @ApiProperty({ description: 'Invoice amount.' })
  @IsNumber()
  amount!: number;

  @ApiProperty({ enum: ['pending', 'paid', 'overdue'], description: 'Invoice status.' })
  @IsIn(['pending', 'paid', 'overdue'])
  status!: 'pending' | 'paid' | 'overdue';

  @ApiPropertyOptional({ description: 'Optional PDF URL.' })
  @IsOptional()
  @IsString()
  pdfUrl?: string;

  @ApiPropertyOptional({ description: 'Optional company id override.' })
  @IsOptional()
  @IsString()
  companyId?: string;

  @ApiPropertyOptional({ description: 'Optional building id.' })
  @IsOptional()
  @IsString()
  buildingId?: string;
}
