export declare const USER_ROLES: readonly ["ManagementCompany", "Accountant", "Resident", "Landlord"];
export type UserRole = (typeof USER_ROLES)[number];
export declare const ACCOUNT_TYPES: readonly ["ManagementCompany", "Resident", "Landlord"];
export type AccountType = (typeof ACCOUNT_TYPES)[number];
export declare const STAFF_ROLES: readonly ["ManagementCompany", "Accountant"];
export declare const PROPERTY_MEMBER_ROLES: readonly ["Resident", "Landlord"];
export declare const PUBLIC_REGISTRATION_ROLES: readonly ["ManagementCompany", "Resident", "Landlord"];
export declare const ROLE_CATALOG: Array<{
    role: UserRole;
    accountType: AccountType;
    label: string;
    isAssignableOnRegistration: boolean;
}>;
export declare function normalizeUserRole(value: unknown): UserRole | undefined;
export declare function normalizeAccountType(value: unknown): AccountType | undefined;
export declare function resolveAccountType(input: {
    role?: unknown;
    accountType?: unknown;
}): AccountType | undefined;
export declare function isStaffRole(role: unknown): boolean;
export declare function isPropertyMemberRole(role: unknown): boolean;
export declare function isPublicRegistrationRole(role: unknown): boolean;
