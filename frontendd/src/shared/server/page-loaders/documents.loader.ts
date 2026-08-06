import { apiFetchSafe } from "@/shared/server/api-client";
import { getAuthenticatedContext, type RoleDataBundle } from "@/shared/server/auth-context";
import {
  getManagementRegistryData,
  getResidentHomeData,
  toDocument,
} from "@/shared/lib/domera-api.server";

type ApiListResponse = { items?: Record<string, unknown>[] };

export async function getDocumentsPageData(roleHint?: string): Promise<RoleDataBundle> {
  const context = await getAuthenticatedContext(roleHint);

  if (context.role === "managementCompany") {
    return getManagementRegistryData(context, {
      includeBuildings: true,
      includeApartments: true,
      includeDocuments: true,
    });
  }

  const [residentData, documentsResponse] = await Promise.all([
    getResidentHomeData(context),
    apiFetchSafe<ApiListResponse>("/documents"),
  ]);

  return {
    ...residentData,
    documents: Array.isArray(documentsResponse?.items) ? documentsResponse.items.map(toDocument) : [],
  };
}
