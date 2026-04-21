export declare class CreateInvoiceDto {
    apartmentId: string;
    month: number;
    year: number;
    amount: number;
    status: 'pending' | 'paid' | 'overdue';
    pdfUrl?: string;
    companyId?: string;
    buildingId?: string;
}
