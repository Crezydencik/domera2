import { apiFetchSafe } from "@/shared/server/api-client";
import { getAuthenticatedContext, type RoleDataBundle } from "@/shared/server/auth-context";
import { emptyRoleDataBundle, toBuilding } from "@/shared/lib/domera-api.server";

type ApiListResponse = { items?: Record<string, unknown>[] };

export async function getBuildingsPageData(roleHint?: string): Promise<RoleDataBundle> {
  const context = await getAuthenticatedContext(roleHint);
  const bundle = emptyRoleDataBundle(context);

  if (context.role !== "managementCompany" || !context.companyId) {
    return bundle;
  }

  const response = await apiFetchSafe<ApiListResponse>(
    `/buildings?companyId=${encodeURIComponent(context.companyId)}`,
  );

  return {
    ...bundle,
    buildings: Array.isArray(response?.items) ? response.items.map(toBuilding) : [],
  };
}
