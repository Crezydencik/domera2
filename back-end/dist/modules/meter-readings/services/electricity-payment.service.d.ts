import { Request } from 'express';
import { RequestUser } from '../../../common/auth/request-user.type';
import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
import { AuditLogService } from '../../../common/services/audit-log.service';
import { MeterReadingAccessService } from './meter-reading-access.service';
export declare class ElectricityPaymentService {
    private readonly firebaseAdminService;
    private readonly auditLogService;
    private readonly accessService;
    constructor(firebaseAdminService: FirebaseAdminService, auditLogService: AuditLogService, accessService: MeterReadingAccessService);
    private electricityPaymentFromDoc;
    list(user: RequestUser, query: {
        buildingId?: string;
        apartmentId?: string;
    }): Promise<{
        items: {
            id: string;
            apartmentId: string;
            amount: number;
            paidKwh: number;
            paidAt: string;
            note: string;
            confirmed: boolean;
            confirmedBy: string;
            createdAt: unknown;
        }[];
    }>;
    create(request: Request, user: RequestUser, payload: Record<string, unknown>): Promise<{
        success: boolean;
        payment: {
            paidAt: string;
            id: string;
            apartmentId: string;
            amount: number;
            paidKwh: number;
            note: string;
            confirmed: boolean;
            confirmedBy: string;
            companyId: string;
            createdAt: Date;
        };
    }>;
    confirm(request: Request, user: RequestUser, paymentId: string, payload: Record<string, unknown>): Promise<{
        success: boolean;
    }>;
    remove(request: Request, user: RequestUser, paymentId: string, apartmentId: string): Promise<{
        success: boolean;
    }>;
}
