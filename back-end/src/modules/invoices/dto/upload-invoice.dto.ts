import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UploadInvoiceDto {
  @ApiProperty({ type: 'string', format: 'binary', description: 'Invoice PDF file.' })
  file!: string;

  @ApiPropertyOptional({ description: 'Building/house id. Optional for API keys bound to a building.' })
  buildingId?: string;

  @ApiPropertyOptional({ description: 'Apartment id. Optional when contractNumber, apartmentNumber, or account id is provided.' })
  apartmentId?: string;

  @ApiPropertyOptional({ description: 'Apartment number inside the selected building.' })
  apartmentNumber?: string;

  @ApiPropertyOptional({ description: 'Contract/agreement number linked to the apartment, owner, or resident.' })
  contractNumber?: string;

  @ApiProperty({ example: '2026-05', description: 'Billing period in YYYY-MM format.' })
  period!: string;

  @ApiProperty({ example: '2026-05-25', description: 'Invoice issue date.' })
  invoiceDate!: string;

  @ApiProperty({ example: 124.55 })
  amount!: number;

  @ApiProperty({ example: 'EUR' })
  currency!: string;

  @ApiProperty({ example: 'erp-2026-05-apt-42', description: 'External invoice id for deduplication.' })
  externalId!: string;

  @ApiProperty({ example: 'pending' })
  status!: string;

  @ApiPropertyOptional({ description: 'Optional company id. API keys are already company-scoped.' })
  companyId?: string;

  @ApiPropertyOptional({ description: 'Optional free-text comment.' })
  comment?: string;
}

export class UploadInvoicesBatchDto {
  @ApiProperty({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    description: 'Invoice PDF files or one ZIP archive containing PDFs and optional items.json. Send repeated files fields or files[] fields.',
  })
  files!: string[];

  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'JSON file with metadata array for each PDF. Optional when items.json is included inside the ZIP archive. Items are matched by order, fileIndex, or fileName.',
    example: JSON.stringify([
      {
        fileName: 'apartment-12.pdf',
        buildingId: 'building_123',
        apartmentId: 'apt_12',
        period: '2026-05',
        invoiceDate: '2026-05-27',
        amount: 125.5,
        currency: 'EUR',
        externalId: 'erp-2026-05-apt-12',
        status: 'issued',
      },
    ]),
  })
  items!: string;
}
