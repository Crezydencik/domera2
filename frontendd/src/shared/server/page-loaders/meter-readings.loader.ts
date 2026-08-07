import { apiFetchSafe } from "@/shared/server/api-client";
import { getAuthenticatedContext } from "@/shared/server/auth-context";
import { normalizeDashboardRole, type DashboardRole } from "@/shared/role-ui";

export type MeterReadingsInitialData = {
  readingsResponse: unknown | null;
  buildingsResponse: unknown | null;
  apartmentsResponse: unknown | null;
};

export type MeterReadingsPageData = {
  role: DashboardRole;
  companyId?: string;
  managementInitialData?: MeterReadingsInitialData;
};

export async function getMeterReadingsPageData(roleHint?: string): Promise<MeterReadingsPageData> {
  const context = await getAuthenticatedContext(roleHint);
  const role = normalizeDashboardRole(context.role);

  if (role === "resident" || role === "landlord") {
    return { role, companyId: context.companyId };
  }

  const companyId = context.companyId || context.userId;
  if (!companyId) {
    return {
      role,
      managementInitialData: {
        readingsResponse: null,
        buildingsResponse: null,
        apartmentsResponse: null,
      },
    };
  }

  const encodedCompanyId = encodeURIComponent(companyId);
  const [readingsResponse, buildingsResponse, apartmentsResponse] = await Promise.all([
    apiFetchSafe(`/meter-readings?companyId=${encodedCompanyId}`),
    apiFetchSafe(`/buildings?companyId=${encodedCompanyId}`),
    apiFetchSafe(`/apartments?companyId=${encodedCompanyId}`),
  ]);

  return {
    role,
    companyId,
    managementInitialData: {
      readingsResponse,
      buildingsResponse,
      apartmentsResponse,
    },
  };
}
