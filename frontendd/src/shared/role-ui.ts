export type DashboardRole = "managementCompany" | "resident" | "landlord";

const roleAliases: Record<string, DashboardRole> = {
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
