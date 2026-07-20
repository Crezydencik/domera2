import { headers } from "next/headers";
import ManagementCompanyPage from "./management-company/page";
import OwnerLandlordPage from "./owner-landlord/page";
import { apiFetch } from "@/shared/lib/domera-api.server";
import { normalizeDashboardRole } from "@/shared/role-ui";

export default async function MeterReadingsPage() {
  const headerStore = await headers();
  let roleHint = headerStore.get("x-domera-role");

  if (!roleHint) {
    const profile = await apiFetch<Record<string, unknown> | null>("/users/me").catch(() => null);
    roleHint =
      typeof profile?.role === "string" && profile.role.trim()
        ? profile.role
        : typeof profile?.accountType === "string" && profile.accountType.trim()
          ? profile.accountType
          : null;
  }

  const role = normalizeDashboardRole(roleHint);

  return role === "resident" || role === "landlord"
    ? <OwnerLandlordPage />
    : <ManagementCompanyPage />;
}
