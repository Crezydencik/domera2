import {
  emptyRoleDataBundle,
  getManagementRegistryData,
} from "@/shared/lib/domera-api.server";
import { getAuthenticatedContext, type RoleDataBundle } from "@/shared/server/auth-context";

export async function getSettingsPageData(roleHint?: string): Promise<RoleDataBundle> {
  const context = await getAuthenticatedContext(roleHint, { requireFreshProfile: true });

  if (context.role !== "managementCompany") {
    return emptyRoleDataBundle(context);
  }

  return getManagementRegistryData(context, {
    includeBuildings: true,
    includeResidents: true,
  });
}
