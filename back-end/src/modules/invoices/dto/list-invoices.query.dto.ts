import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListInvoicesQueryDto {
  @ApiPropertyOptional({ description: 'Optional company id filter.' })
  @IsOptional()
  @IsString()
  companyId?: string;

  @ApiPropertyOptional({ description: 'Optional apartment id filter.' })
  @IsOptional()
  @IsString()
  apartmentId?: string;

  @ApiPropertyOptional({ description: 'Optional building id filter.' })
  @IsOptional()
  @IsString()
  buildingId?: string;

  @ApiPropertyOptional({ enum: ['owner', 'tenant', 'general'], description: 'Optional recipient type filter.' })
  @IsOptional()
  @IsString()
  recipientType?: string;

  @ApiPropertyOptional({ description: 'Page size (1-200). When omitted, all invoices are returned (legacy behaviour).' })
  @IsOptional()
  @Matches(/^\d{1,3}$/)
  limit?: string;

  @ApiPropertyOptional({ description: 'Opaque cursor from the previous page (`nextCursor`).' })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  cursor?: string;
}
