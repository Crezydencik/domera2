import {
  getManagementRegistryData,
  getResidentHomeData,
} from "@/shared/lib/domera-api.server";
import { getAuthenticatedContext, type RoleDataBundle } from "@/shared/server/auth-context";

export async function getResidentsPageData(roleHint?: string): Promise<RoleDataBundle> {
  const context = await getAuthenticatedContext(roleHint, { requireFreshProfile: true });

  if (context.role === "managementCompany") {
    return getManagementRegistryData(context, {
      includeBuildings: true,
      includeApartments: true,
      includeResidents: true,
    });
  }

  return getResidentHomeData(context);
}
