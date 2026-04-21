import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateInvoiceDto {
  @ApiPropertyOptional({ description: 'Updated invoice month.' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  month?: number;

  @ApiPropertyOptional({ description: 'Updated invoice year.' })
  @IsOptional()
  @IsNumber()
  @Min(2000)
  year?: number;

  @ApiPropertyOptional({ description: 'Updated invoice amount.' })
  @IsOptional()
  @IsNumber()
  amount?: number;

  @ApiPropertyOptional({ enum: ['pending', 'paid', 'overdue'], description: 'Updated invoice status.' })
  @IsOptional()
  @IsIn(['pending', 'paid', 'overdue'])
  status?: 'pending' | 'paid' | 'overdue';

  @ApiPropertyOptional({ description: 'Updated PDF URL.' })
  @IsOptional()
  @IsString()
  pdfUrl?: string;

  @ApiPropertyOptional({ description: 'Updated building id.' })
  @IsOptional()
  @IsString()
  buildingId?: string;
}
