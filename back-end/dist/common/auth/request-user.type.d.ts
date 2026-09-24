import { AccountType, UserRole } from './role.constants';
export type RequestUser = {
    uid: string;
    email?: string;
    role?: UserRole;
    accountType?: AccountType;
    companyId?: string;
    apartmentId?: string;
};
