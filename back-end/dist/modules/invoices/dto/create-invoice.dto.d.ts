export declare class CreateInvoiceDto {
    apartmentId: string;
    month: number;
    year: number;
    amount: number;
    status: 'pending' | 'paid' | 'overdue';
    recipientType?: 'owner' | 'tenant' | 'general';
    pdfUrl?: string;
    companyId?: string;
    buildingId?: string;
}
