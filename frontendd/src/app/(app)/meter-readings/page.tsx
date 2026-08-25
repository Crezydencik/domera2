import { headers } from "next/headers";
import ManagementCompanyPage from "./_management-company-page";
import OwnerLandlordPage from "./_owner-landlord-page";
import { getMeterReadingsPageData } from "@/shared/server/page-loaders/meter-readings.loader";
import { requireManagementCompanyBuildings } from "@/shared/server/management-building-access";

function firstHeader(headerStore: Headers, name: string) {
  const value = headerStore.get(name)?.trim();
  return value || undefined;
}

export default async function MeterReadingsPage() {
  const headerStore = await headers();
  const data = await getMeterReadingsPageData(firstHeader(headerStore, "x-domera-role"));
  requireManagementCompanyBuildings(data);

  return data.role === "resident" || data.role === "landlord"
    ? <OwnerLandlordPage />
    : <ManagementCompanyPage initialCompanyId={data.companyId} initialData={data.managementInitialData} canManageReadings={data.canManageReadings} />;
}
