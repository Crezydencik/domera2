import { FirebaseAdminService } from '../../../common/infrastructure/firebase/firebase-admin.service';
export type EmailLogType = 'registrationCode' | 'passwordReset' | 'ownerInvitation' | 'tenantInvitation' | 'tenantInvitedByOwner' | 'invoiceGenerated' | 'meterReadingReminder' | 'notification';
export type EmailLogStatus = 'success' | 'error';
export type EmailLogInput = {
    type: EmailLogType;
    status: EmailLogStatus;
    to: string;
    subject: string;
    providerMessageId?: string;
    errorMessage?: string;
    deliveryKey?: string;
    companyId?: string;
    buildingId?: string;
    apartmentId?: string;
    metadata?: Record<string, unknown>;
};
export type EmailDeliveryLogItem = {
    id: string;
    type: EmailLogType | 'unknown';
    status: EmailLogStatus;
    to: string;
    subject: string;
    createdAt: string | null;
    errorMessage?: string;
    deliveryKey?: string;
    companyId?: string;
    buildingId?: string;
    apartmentId?: string;
    metadata?: Record<string, unknown>;
};
export declare class EmailLogService {
    private readonly firebaseAdminService;
    private readonly logger;
    constructor(firebaseAdminService: FirebaseAdminService);
    record(input: EmailLogInput): Promise<void>;
    getStats(query: {
        type?: EmailLogType;
        companyId?: string;
        buildingId?: string;
        apartmentId?: string;
    }): Promise<{
        total: number;
        success: number;
        error: number;
        last30Days: {
            total: number;
            success: number;
            error: number;
        };
        byType: Record<string, {
            total: number;
            success: number;
            error: number;
        }>;
        lastSentAt: string | null;
    }>;
    hasSuccessfulDeliveryKey(deliveryKey: string): Promise<boolean>;
    getDeliveries(query: {
        type?: EmailLogType;
        companyId?: string;
        buildingId?: string;
        apartmentId?: string;
        deliveryKeyPrefix?: string;
        limit?: number;
    }): Promise<EmailDeliveryLogItem[]>;
    private normalizeType;
    private toDate;
}
