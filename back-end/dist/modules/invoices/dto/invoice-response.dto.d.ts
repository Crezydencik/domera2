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
}
export declare class CreateInvoiceResponseDto {
    success: boolean;
    invoice: InvoiceItemDto;
}
export declare class ListInvoicesResponseDto {
    items: InvoiceItemDto[];
    query: Record<string, string | undefined>;
}
