"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROLE_CATALOG = exports.PUBLIC_REGISTRATION_ROLES = exports.PROPERTY_MEMBER_ROLES = exports.STAFF_ROLES = exports.ACCOUNT_TYPES = exports.USER_ROLES = void 0;
exports.normalizeUserRole = normalizeUserRole;
exports.normalizeAccountType = normalizeAccountType;
exports.resolveAccountType = resolveAccountType;
exports.isStaffRole = isStaffRole;
exports.isPropertyMemberRole = isPropertyMemberRole;
exports.isPublicRegistrationRole = isPublicRegistrationRole;
exports.USER_ROLES = ['ManagementCompany', 'Accountant', 'Resident', 'Landlord'];
exports.ACCOUNT_TYPES = ['ManagementCompany', 'Resident', 'Landlord'];
exports.STAFF_ROLES = ['ManagementCompany', 'Accountant'];
exports.PROPERTY_MEMBER_ROLES = ['Resident', 'Landlord'];
exports.PUBLIC_REGISTRATION_ROLES = ['ManagementCompany', 'Resident', 'Landlord'];
exports.ROLE_CATALOG = [
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
const ROLE_ALIASES = {
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
const ACCOUNT_TYPE_ALIASES = {
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
function normalizeUserRole(value) {
    if (typeof value !== 'string')
        return undefined;
    const trimmed = value.trim();
    if (!trimmed)
        return undefined;
    if (exports.USER_ROLES.includes(trimmed)) {
        return trimmed;
    }
    return ROLE_ALIASES[trimmed.toLowerCase()];
}
function normalizeAccountType(value) {
    if (typeof value !== 'string')
        return undefined;
    const trimmed = value.trim();
    if (!trimmed)
        return undefined;
    if (exports.ACCOUNT_TYPES.includes(trimmed)) {
        return trimmed;
    }
    return ACCOUNT_TYPE_ALIASES[trimmed.toLowerCase()];
}
function resolveAccountType(input) {
    const normalizedAccountType = normalizeAccountType(input.accountType);
    if (normalizedAccountType)
        return normalizedAccountType;
    const normalizedRole = normalizeUserRole(input.role);
    if (!normalizedRole)
        return undefined;
    if (normalizedRole === 'Accountant')
        return 'ManagementCompany';
    return normalizedRole;
}
function isStaffRole(role) {
    const normalizedRole = normalizeUserRole(role);
    return Boolean(normalizedRole && exports.STAFF_ROLES.includes(normalizedRole));
}
function isPropertyMemberRole(role) {
    const normalizedRole = normalizeUserRole(role);
    return Boolean(normalizedRole && exports.PROPERTY_MEMBER_ROLES.includes(normalizedRole));
}
function isPublicRegistrationRole(role) {
    const normalizedRole = normalizeUserRole(role);
    return Boolean(normalizedRole && exports.PUBLIC_REGISTRATION_ROLES.includes(normalizedRole));
}
