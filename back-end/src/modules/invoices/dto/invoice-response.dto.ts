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

  @ApiPropertyOptional({ nullable: true })
  externalId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  period?: string | null;

  @ApiPropertyOptional({ nullable: true })
  invoiceDate?: string | null;

  @ApiPropertyOptional({ nullable: true })
  fileName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  currency?: string | null;

  @ApiPropertyOptional({ nullable: true })
  comment?: string | null;
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

export class UploadInvoiceResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiPropertyOptional({ example: 'inv_12345' })
  invoice_id?: string;

  @ApiPropertyOptional({ example: 'approval_12345' })
  approval_id?: string;

  @ApiProperty({ example: 'Invoice uploaded successfully' })
  message!: string;
}

export class UploadInvoicesBatchResultDto {
  @ApiProperty({ example: 0 })
  index!: number;

  @ApiProperty({ example: 'apartment-12.pdf' })
  fileName!: string;

  @ApiProperty({ example: true })
  success!: boolean;

  @ApiPropertyOptional({ example: 'inv_12345' })
  invoice_id?: string;

  @ApiPropertyOptional({ example: 'approval_12345' })
  approval_id?: string;

  @ApiPropertyOptional({ example: 'Invoice uploaded successfully' })
  message?: string;

  @ApiPropertyOptional({ example: 'Apartment not found' })
  error?: string;
}

export class UploadInvoicesBatchResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 'batch_f2a54c8730b74e61' })
  batch_id!: string;

  @ApiProperty({ example: 10 })
  total!: number;

  @ApiProperty({ example: 9 })
  processed!: number;

  @ApiProperty({ example: 1 })
  failed!: number;

  @ApiProperty({ example: 'Invoice batch processed' })
  message!: string;

  @ApiProperty({ type: [UploadInvoicesBatchResultDto] })
  results!: UploadInvoicesBatchResultDto[];
}

export class InvoiceUploadErrorResponseDto {
  @ApiProperty({ example: false })
  success!: boolean;

  @ApiProperty({ example: 'Apartment not found' })
  error!: string;
}

export class InvoiceUploadHistoryItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  status!: string;

  @ApiPropertyOptional()
  invoiceId?: string;

  @ApiPropertyOptional()
  externalId?: string;

  @ApiPropertyOptional()
  companyId?: string;

  @ApiPropertyOptional()
  apartmentId?: string;

  @ApiPropertyOptional()
  buildingId?: string;

  @ApiPropertyOptional()
  fileName?: string;

  @ApiPropertyOptional()
  error?: string;
}

export class ListInvoiceUploadsResponseDto {
  @ApiProperty({ type: [InvoiceUploadHistoryItemDto] })
  items!: InvoiceUploadHistoryItemDto[];
}
