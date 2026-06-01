export declare class UploadInvoiceDto {
    file: string;
    buildingId?: string;
    apartmentId?: string;
    apartmentNumber?: string;
    contractNumber?: string;
    period: string;
    invoiceDate: string;
    amount: number;
    currency: string;
    externalId: string;
    status: string;
    companyId?: string;
    comment?: string;
}
export declare class UploadInvoicesBatchDto {
    files: string[];
    items: string;
}
