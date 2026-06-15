export type DashboardRole = "platformAdmin" | "managementCompany" | "resident" | "landlord";

const roleAliases: Record<string, DashboardRole> = {
  platformadmin: "platformAdmin",
  superadmin: "platformAdmin",
  admin: "platformAdmin",
  managementcompany: "managementCompany",
  management: "managementCompany",
  manager: "managementCompany",
  company: "managementCompany",
  accountant: "managementCompany",
  resident: "resident",
  renter: "resident",
  tenant: "resident",
  landlord: "landlord",
  owner: "landlord",
};

export function normalizeDashboardRole(value?: string | null): DashboardRole {
  const normalized = String(value ?? "")
    .trim()
    .replace(/[^a-z]/gi, "")
    .toLowerCase();

  return roleAliases[normalized] ?? "managementCompany";
}
