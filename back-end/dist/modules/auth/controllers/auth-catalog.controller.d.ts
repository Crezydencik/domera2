export declare class AuthCatalogController {
    getAccountCatalog(): {
        accountTypes: readonly ["ManagementCompany", "Resident", "Landlord"];
        roles: {
            role: import("../../../common/auth/role.constants").UserRole;
            accountType: import("../../../common/auth/role.constants").AccountType;
            label: string;
            isAssignableOnRegistration: boolean;
        }[];
    };
}
