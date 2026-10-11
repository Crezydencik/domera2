import { getAuthenticatedContext, type RoleDataBundle } from "@/shared/server/auth-context";
import {
  emptyRoleDataBundle,
  getManagementRegistryData,
  getResidentHomeData,
  toMeterReading,
  toResident,
} from "@/shared/lib/domera-api.server";
import { apiFetchSafe } from "@/shared/server/api-client";

type ApiListResponse = {
  items?: Record<string, unknown>[];
};

export async function getDashboardPageData(roleHint?: string): Promise<RoleDataBundle> {
  const context = await getAuthenticatedContext(roleHint);
  const now = new Date();
  const meterReadingPeriod = { month: now.getMonth() + 1, year: now.getFullYear() };

  if (context.role === "platformAdmin") {
    const usersResponse = await apiFetchSafe<ApiListResponse>("/users");

    return {
      ...emptyRoleDataBundle(context),
      residents: Array.isArray(usersResponse?.items) ? usersResponse.items.map((item) => toResident(item)) : [],
    };
  }

  if (context.role === "managementCompany") {
    return getManagementRegistryData(context, {
      includeBuildings: true,
      includeApartments: true,
      includeMeterReadings: true,
      includeApartmentOwnerMetadata: false,
      meterReadingPeriod,
    });
  }

  const [residentData, meterReadingsResponse] = await Promise.all([
    getResidentHomeData(context),
    apiFetchSafe<ApiListResponse>(`/meter-readings?month=${meterReadingPeriod.month}&year=${meterReadingPeriod.year}`),
  ]);

  return {
    ...residentData,
    meterReadings: Array.isArray(meterReadingsResponse?.items)
      ? meterReadingsResponse.items.map(toMeterReading)
      : [],
  };
}
