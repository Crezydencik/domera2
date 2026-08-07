import "server-only";

import { redirect } from "next/navigation";
import type { RoleDataBundle } from "@/shared/server/auth-context";
import { isApprovedBuilding } from "@/shared/lib/buildings";
import { ROUTES } from "@/shared/lib/routes";

type MaybeBuildingsData = {
  role?: string;
  buildings?: unknown[];
  managementInitialData?: {
    buildingsResponse?: unknown;
  };
};

function listHasApprovedBuildings(value: unknown) {
  if (Array.isArray(value)) {
    return value.some((item) => item && typeof item === "object" && isApprovedBuilding(item as { status?: unknown }));
  }

  if (value && typeof value === "object") {
    const items = (value as { items?: unknown }).items;
    return listHasApprovedBuildings(items);
  }

  return false;
}

export function requireManagementCompanyBuildings(data: RoleDataBundle | MaybeBuildingsData) {
  if (data.role !== "managementCompany") return;

  const accessData = data as MaybeBuildingsData;
  const hasBuildings =
    listHasApprovedBuildings(accessData.buildings) ||
    listHasApprovedBuildings(accessData.managementInitialData?.buildingsResponse);

  if (!hasBuildings) {
    redirect(ROUTES.buildings);
  }
}
