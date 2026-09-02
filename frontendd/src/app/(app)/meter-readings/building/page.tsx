import { headers } from "next/headers";
import { redirect } from "next/navigation";
import BuildingPrimaryMeterPage from "../_building-primary-meter-page";
import { getMeterReadingsPageData } from "@/shared/server/page-loaders/meter-readings.loader";
import { requireManagementCompanyBuildings } from "@/shared/server/management-building-access";
import { ROUTES } from "@/shared/lib/routes";

function firstHeader(headerStore: Headers, name: string) {
  const value = headerStore.get(name)?.trim();
  return value || undefined;
}

function isAccountantRole(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/[^a-z]/gi, "")
    .toLowerCase() === "accountant";
}

export default async function BuildingMeterReadingsPage() {
  const headerStore = await headers();
  const data = await getMeterReadingsPageData(firstHeader(headerStore, "x-domera-role"));
  requireManagementCompanyBuildings(data);
  if (isAccountantRole(data.rawRole) && !data.canManageReadings) {
    redirect(ROUTES.meterReadings);
  }

  return (
    <BuildingPrimaryMeterPage
      initialCompanyId={data.companyId}
      initialData={data.managementInitialData}
      canManageReadings={data.canManageReadings}
    />
  );
}
