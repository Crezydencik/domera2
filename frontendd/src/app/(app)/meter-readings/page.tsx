import { cookies, headers } from "next/headers";
import ManagementCompanyPage from "./management-company/page";
import OwnerLandlordPage from "./owner-landlord/page";
import { normalizeDashboardRole } from "@/shared/role-ui";

export default async function MeterReadingsPage() {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const role = normalizeDashboardRole(
    headerStore.get("x-domera-role") ??
      cookieStore.get("domera_accountType")?.value ??
      cookieStore.get("domera_role")?.value,
  );

  return role === "resident" || role === "landlord"
    ? <OwnerLandlordPage />
    : <ManagementCompanyPage />;
}
