import { Request, Response } from 'express';
import { RequestUser } from '../../common/auth/request-user.type';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { ListInvoicesQueryDto } from './dto/list-invoices.query.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
type UploadedBinaryFile = {
    fieldname?: string;
    buffer: Buffer;
    originalname?: string;
    mimetype?: string;
    size?: number;
};
export declare class InvoicesController {
    private readonly invoicesService;
    constructor(invoicesService: InvoicesService);
    create(request: Request, user: RequestUser, body: CreateInvoiceDto): Promise<{
        success: boolean;
        invoice: {
            id: string;
            apartmentId: string;
            month: number;
            year: number;
            amount: number;
            status: string;
            pdfUrl: string;
            companyId: string;
            buildingId: string | null;
            createdAt: Date;
            createdByUid: string;
        };
    }>;
    upload(request: Request, user: RequestUser, file: UploadedBinaryFile | undefined, body: Record<string, unknown>): Promise<{
        success: boolean;
        approval_id: string;
        company_id: string;
        building_id: string;
        apartment_id: string;
        message: string;
        invoice_id?: undefined;
    } | {
        success: boolean;
        invoice_id: string;
        company_id: string;
        building_id: string;
        apartment_id: string;
        message: string;
        approval_id?: undefined;
    }>;
    uploadBatch(request: Request, user: RequestUser, uploadedFiles: UploadedBinaryFile[] | undefined, body: Record<string, unknown>): Promise<{
        success: boolean;
        batch_id: string;
        total: number;
        processed: number;
        failed: number;
        message: string;
        results: {
            index: number;
            fileName: string;
            success: boolean;
            invoice_id?: string;
            approval_id?: string;
            message?: string;
            error?: string;
        }[];
    }>;
    list(user: RequestUser, query: ListInvoicesQueryDto): Promise<{
        items: Record<string, unknown>[];
        query: Record<string, string | undefined>;
    }>;
    uploadHistory(user: RequestUser, query: Record<string, string | undefined>): Promise<{
        items: Record<string, unknown>[];
    }>;
    pendingApprovals(user: RequestUser, query: Record<string, string | undefined>): Promise<{
        items: Record<string, unknown>[];
    }>;
    pendingApprovalPdf(user: RequestUser, approvalId: string, response: Response): Promise<void>;
    approvePendingApproval(request: Request, user: RequestUser, approvalId: string): Promise<{
        success: boolean;
        invoice_id: string;
        message: string;
    }>;
    approvePendingApprovals(request: Request, user: RequestUser, body: Record<string, unknown>): Promise<{
        success: boolean;
        total: number;
        processed: number;
        failed: number;
        results: {
            approval_id: string;
            success: boolean;
            invoice_id?: string;
            error?: string;
        }[];
    }>;
    cancelPendingApprovals(request: Request, user: RequestUser, body: Record<string, unknown>): Promise<{
        success: boolean;
        total: number;
        processed: number;
        failed: number;
        results: {
            approval_id: string;
            success: boolean;
            error?: string;
        }[];
    }>;
    cancelPendingApproval(request: Request, user: RequestUser, approvalId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    pdf(user: RequestUser, invoiceId: string, response: Response): Promise<void>;
    byId(user: RequestUser, invoiceId: string): Promise<{
        apartmentId: string | undefined;
        id: string;
    }>;
    update(request: Request, user: RequestUser, invoiceId: string, body: UpdateInvoiceDto): Promise<{
        success: boolean;
    }>;
    remove(request: Request, user: RequestUser, invoiceId: string): Promise<{
        success: boolean;
    }>;
}
export {};
