export declare class UpdateInvoiceDto {
    month?: number;
    year?: number;
    amount?: number;
    status?: 'pending' | 'paid' | 'overdue';
    pdfUrl?: string;
    buildingId?: string;
}
