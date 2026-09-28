import { AccountType, UserRole } from './role.constants';

export type RequestUser = {
  uid: string;
  email?: string;
  emailVerified?: boolean;
  role?: UserRole;
  accountType?: AccountType;
  companyId?: string;
  apartmentId?: string;
};
