export const USER_ROLES = ['ManagementCompany', 'Accountant', 'Resident', 'Landlord'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ACCOUNT_TYPES = ['ManagementCompany', 'Resident', 'Landlord'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const STAFF_ROLES = ['ManagementCompany', 'Accountant'] as const satisfies readonly UserRole[];
export const PROPERTY_MEMBER_ROLES = ['Resident', 'Landlord'] as const satisfies readonly UserRole[];
export const PUBLIC_REGISTRATION_ROLES = ['ManagementCompany', 'Resident', 'Landlord'] as const satisfies readonly UserRole[];

export const ROLE_CATALOG: Array<{
  role: UserRole;
  accountType: AccountType;
  label: string;
  isAssignableOnRegistration: boolean;
}> = [
  {
    role: 'ManagementCompany',
    accountType: 'ManagementCompany',
    label: 'Management company',
    isAssignableOnRegistration: true,
  },
  {
    role: 'Accountant',
    accountType: 'ManagementCompany',
    label: 'Accountant',
    isAssignableOnRegistration: false,
  },
  {
    role: 'Resident',
    accountType: 'Resident',
    label: 'Resident',
    isAssignableOnRegistration: true,
  },
  {
    role: 'Landlord',
    accountType: 'Landlord',
    label: 'Landlord',
    isAssignableOnRegistration: true,
  },
];

const ROLE_ALIASES: Record<string, UserRole> = {
  managementcompany: 'ManagementCompany',
  'management-company': 'ManagementCompany',
  management_company: 'ManagementCompany',
  manager: 'ManagementCompany',
  company: 'ManagementCompany',
  accountant: 'Accountant',
  resident: 'Resident',
  tenant: 'Resident',
  renter: 'Resident',
  landlord: 'Landlord',
  owner: 'Landlord',
};

const ACCOUNT_TYPE_ALIASES: Record<string, AccountType> = {
  managementcompany: 'ManagementCompany',
  'management-company': 'ManagementCompany',
  management_company: 'ManagementCompany',
  manager: 'ManagementCompany',
  company: 'ManagementCompany',
  resident: 'Resident',
  tenant: 'Resident',
  renter: 'Resident',
  landlord: 'Landlord',
  owner: 'Landlord',
};

export function normalizeUserRole(value: unknown): UserRole | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if ((USER_ROLES as readonly string[]).includes(trimmed)) {
    return trimmed as UserRole;
  }

  return ROLE_ALIASES[trimmed.toLowerCase()];
}

export function normalizeAccountType(value: unknown): AccountType | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if ((ACCOUNT_TYPES as readonly string[]).includes(trimmed)) {
    return trimmed as AccountType;
  }

  return ACCOUNT_TYPE_ALIASES[trimmed.toLowerCase()];
}

export function resolveUserRole(input: {
  role?: unknown;
  accountType?: unknown;
}): UserRole | undefined {
  const normalizedRole = normalizeUserRole(input.role);
  if (normalizedRole) return normalizedRole;

  const normalizedAccountType = normalizeAccountType(input.accountType);
  if (!normalizedAccountType) return undefined;

  return normalizedAccountType;
}

export function resolveAccountType(input: {
  role?: unknown;
  accountType?: unknown;
}): AccountType | undefined {
  const normalizedAccountType = normalizeAccountType(input.accountType);
  if (normalizedAccountType) return normalizedAccountType;

  const normalizedRole = normalizeUserRole(input.role);
  if (!normalizedRole) return undefined;
  if (normalizedRole === 'Accountant') return 'ManagementCompany';
  return normalizedRole;
}

export function isStaffRole(role: unknown): boolean {
  const normalizedRole = normalizeUserRole(role);
  return Boolean(normalizedRole && (STAFF_ROLES as readonly string[]).includes(normalizedRole));
}

export function isPropertyMemberRole(role: unknown): boolean {
  const normalizedRole = normalizeUserRole(role);
  return Boolean(normalizedRole && (PROPERTY_MEMBER_ROLES as readonly string[]).includes(normalizedRole));
}

export function isPublicRegistrationRole(role: unknown): boolean {
  const normalizedRole = normalizeUserRole(role);
  return Boolean(normalizedRole && (PUBLIC_REGISTRATION_ROLES as readonly string[]).includes(normalizedRole));
}
