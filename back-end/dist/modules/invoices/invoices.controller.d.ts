import { Request } from 'express';
import { RequestUser } from '../../common/auth/request-user.type';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { ListInvoicesQueryDto } from './dto/list-invoices.query.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
export declare class InvoicesController {
    private readonly invoicesService;
    constructor(invoicesService: InvoicesService);
    create(request: Request, user: RequestUser, body: CreateInvoiceDto): Promise<{
        success: boolean;
        invoice: {
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
            id: string;
        };
    }>;
    list(user: RequestUser, query: ListInvoicesQueryDto): Promise<{
        items: Record<string, unknown>[];
        query: Record<string, string | undefined>;
    } | {
        items: {
            id: string;
        }[];
        query: Record<string, string | undefined>;
    }>;
    byId(user: RequestUser, invoiceId: string): Promise<{
        id: string;
    }>;
    update(request: Request, user: RequestUser, invoiceId: string, body: UpdateInvoiceDto): Promise<{
        success: boolean;
    }>;
    remove(request: Request, user: RequestUser, invoiceId: string): Promise<{
        success: boolean;
    }>;
}
