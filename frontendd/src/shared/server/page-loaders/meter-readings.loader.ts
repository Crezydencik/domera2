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
  rawRole?: string;
  companyId?: string;
  canManageReadings?: boolean;
  managementInitialData?: MeterReadingsInitialData;
};

export async function getMeterReadingsPageData(roleHint?: string): Promise<MeterReadingsPageData> {
  const context = await getAuthenticatedContext(roleHint);
  const role = normalizeDashboardRole(context.role);
  const rawRole = context.rawRole;

  if (role === "resident" || role === "landlord") {
    return { role, rawRole, companyId: context.companyId };
  }

  const companyId = context.companyId || context.userId;
  if (!companyId) {
    return {
      role,
      rawRole,
      canManageReadings: false,
      managementInitialData: {
        readingsResponse: null,
        buildingsResponse: null,
        apartmentsResponse: null,
      },
    };
  }

  const encodedCompanyId = encodeURIComponent(companyId);
  const [readingsResponse, buildingsResponse, apartmentsResponse, companyResponse] = await Promise.all([
    apiFetchSafe(`/meter-readings?companyId=${encodedCompanyId}`),
    apiFetchSafe(`/buildings?companyId=${encodedCompanyId}`),
    apiFetchSafe(`/apartments?companyId=${encodedCompanyId}`),
    apiFetchSafe(`/company/${encodedCompanyId}`),
  ]);
  const normalizedRawRole = String(rawRole ?? "").replace(/[^a-z]/gi, "").toLowerCase();
  const currentUserPermissions =
    companyResponse && typeof companyResponse === "object" && "currentUserPermissions" in companyResponse
      ? (companyResponse as { currentUserPermissions?: Record<string, unknown> }).currentUserPermissions
      : undefined;
  const canManageReadings =
    normalizedRawRole !== "accountant"
    || currentUserPermissions?.manageMeterReadings === true
    || currentUserPermissions?.manageMeterReadingData === true;

  return {
    role,
    rawRole,
    companyId,
    canManageReadings,
    managementInitialData: {
      readingsResponse,
      buildingsResponse,
      apartmentsResponse,
    },
  };
}
