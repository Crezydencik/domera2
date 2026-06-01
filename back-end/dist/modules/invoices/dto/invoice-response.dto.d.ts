export declare class InvoiceItemDto {
    id: string;
    apartmentId: string;
    month: number;
    year: number;
    amount: number;
    status: string;
    pdfUrl?: string;
    companyId?: string;
    buildingId?: string | null;
    externalId?: string | null;
    period?: string | null;
    invoiceDate?: string | null;
    currency?: string | null;
    comment?: string | null;
}
export declare class CreateInvoiceResponseDto {
    success: boolean;
    invoice: InvoiceItemDto;
}
export declare class ListInvoicesResponseDto {
    items: InvoiceItemDto[];
    query: Record<string, string | undefined>;
}
export declare class UploadInvoiceResponseDto {
    success: boolean;
    invoice_id?: string;
    approval_id?: string;
    message: string;
}
export declare class UploadInvoicesBatchResultDto {
    index: number;
    fileName: string;
    success: boolean;
    invoice_id?: string;
    approval_id?: string;
    message?: string;
    error?: string;
}
export declare class UploadInvoicesBatchResponseDto {
    success: boolean;
    batch_id: string;
    total: number;
    processed: number;
    failed: number;
    message: string;
    results: UploadInvoicesBatchResultDto[];
}
export declare class InvoiceUploadErrorResponseDto {
    success: boolean;
    error: string;
}
export declare class InvoiceUploadHistoryItemDto {
    id: string;
    status: string;
    invoiceId?: string;
    externalId?: string;
    companyId?: string;
    apartmentId?: string;
    buildingId?: string;
    fileName?: string;
    error?: string;
}
export declare class ListInvoiceUploadsResponseDto {
    items: InvoiceUploadHistoryItemDto[];
}
