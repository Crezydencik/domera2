import { headers } from "next/headers";
import BuildingPrimaryMeterPage from "../_building-primary-meter-page";
import { getMeterReadingsPageData } from "@/shared/server/page-loaders/meter-readings.loader";
import { requireManagementCompanyBuildings } from "@/shared/server/management-building-access";

function firstHeader(headerStore: Headers, name: string) {
  const value = headerStore.get(name)?.trim();
  return value || undefined;
}

export default async function BuildingMeterReadingsPage() {
  const headerStore = await headers();
  const data = await getMeterReadingsPageData(firstHeader(headerStore, "x-domera-role"));
  requireManagementCompanyBuildings(data);

  return (
    <BuildingPrimaryMeterPage
      initialCompanyId={data.companyId}
      initialData={data.managementInitialData}
      canManageReadings={data.canManageReadings}
    />
  );
}
