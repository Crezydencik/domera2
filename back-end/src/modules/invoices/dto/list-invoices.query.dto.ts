import { IsOptional, IsString } from 'class-validator';
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
}
