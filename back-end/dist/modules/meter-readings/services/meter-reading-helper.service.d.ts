import { RequestUser } from '../../../common/auth/request-user.type';
export declare class MeterReadingHelperService {
    historySubmittedAtTime(value: unknown): number;
    currentReadingPeriod(date?: Date): {
        month: number;
        year: number;
    };
    hasInvoiceLinkedElectricityReadings(history: Record<string, unknown>[]): boolean;
    extractApartmentReadings(apartmentId: string, apartment: Record<string, unknown>, buildingInfo?: {
        name?: string;
        address?: string;
    }, user?: RequestUser): Record<string, unknown>[];
}
