import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InvoiceItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  apartmentId!: string;

  @ApiProperty()
  month!: number;

  @ApiProperty()
  year!: number;

  @ApiProperty()
  amount!: number;

  @ApiProperty({ example: 'pending' })
  status!: string;

  @ApiPropertyOptional({ nullable: true })
  pdfUrl?: string;

  @ApiPropertyOptional({ nullable: true })
  companyId?: string;

  @ApiPropertyOptional({ nullable: true })
  buildingId?: string | null;
}

export class CreateInvoiceResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ type: InvoiceItemDto })
  invoice!: InvoiceItemDto;
}

export class ListInvoicesResponseDto {
  @ApiProperty({ type: [InvoiceItemDto] })
  items!: InvoiceItemDto[];

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  query!: Record<string, string | undefined>;
}
