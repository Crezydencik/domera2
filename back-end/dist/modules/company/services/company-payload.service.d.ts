import { FieldValue } from 'firebase-admin/firestore';
export declare class CompanyPayloadService {
    firstString(...values: unknown[]): string;
    toOptionalTrimmedString(value: unknown): string | undefined;
    normalizeStaffContacts(value: unknown): Array<Record<string, unknown>>;
    normalizeInvoiceSettings(value: unknown, existing?: unknown): Record<string, unknown> | undefined;
    normalizeCompanyPayload(payload: Record<string, unknown>, existing?: Record<string, unknown>): {
        [k: string]: string | string[] | Record<string, unknown> | FieldValue | undefined;
    };
}
