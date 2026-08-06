import { headers } from "next/headers";
import ManagementCompanyPage from "./management-company/page";
import OwnerLandlordPage from "./owner-landlord/page";
import { getCurrentProfile } from "@/shared/lib/domera-api.server";
import { normalizeDashboardRole } from "@/shared/role-ui";

function firstHeader(headerStore: Headers, name: string) {
  const value = headerStore.get(name)?.trim();
  return value || undefined;
}

export default async function MeterReadingsPage() {
  const headerStore = await headers();
  let profile: Record<string, unknown> | null = null;
  let roleHint = firstHeader(headerStore, "x-domera-role");
  let companyId = firstHeader(headerStore, "x-domera-company-id") ?? firstHeader(headerStore, "x-domera-user-id");

  if (!roleHint || !companyId) {
    profile = await getCurrentProfile().catch(() => null);
    roleHint =
      typeof profile?.role === "string" && profile.role.trim()
        ? profile.role
        : typeof profile?.accountType === "string" && profile.accountType.trim()
          ? profile.accountType
          : undefined;
    companyId =
      typeof profile?.companyId === "string" && profile.companyId.trim()
        ? profile.companyId.trim()
        : typeof profile?.uid === "string" && profile.uid.trim()
          ? profile.uid.trim()
          : typeof profile?.id === "string" && profile.id.trim()
            ? profile.id.trim()
            : companyId;
  }

  const role = normalizeDashboardRole(roleHint);

  return role === "resident" || role === "landlord"
    ? <OwnerLandlordPage />
    : <ManagementCompanyPage initialCompanyId={companyId} />;
}
