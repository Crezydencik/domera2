import { FieldValue } from 'firebase-admin/firestore';
export type CompanyMemberPermissions = {
    viewCompanyInfo: boolean;
    editCompanyInfo: boolean;
    manageMembers: boolean;
    manageApiKeys: boolean;
    manageInvoiceSettings: boolean;
};
export declare class CompanyPayloadService {
    firstString(...values: unknown[]): string;
    toOptionalTrimmedString(value: unknown): string | undefined;
    defaultCompanyMemberPermissions(overrides?: Partial<CompanyMemberPermissions>): CompanyMemberPermissions;
    normalizeCompanyMemberPermissions(value: unknown): CompanyMemberPermissions;
    normalizeCompanyMemberPermissionMap(value: unknown): Record<string, CompanyMemberPermissions>;
    getCompanyMemberPermissions(company: Record<string, unknown>, memberId: string): CompanyMemberPermissions;
    normalizeLegacyCompanyMembers(companyId: string, company: Record<string, unknown>): {
        changed: boolean;
        manager: string[];
        employees: string[];
        userIds: string[];
        memberPermissions: {
            [k: string]: CompanyMemberPermissions;
        };
    };
    normalizeStaffContacts(value: unknown): Array<Record<string, unknown>>;
    normalizeInvoiceSettings(value: unknown, existing?: unknown): Record<string, unknown> | undefined;
    normalizeCompanyPayload(payload: Record<string, unknown>, existing?: Record<string, unknown>): {
        [k: string]: string | string[] | Record<string, unknown> | FieldValue | Record<string, CompanyMemberPermissions> | undefined;
    };
}
