import {
  emptyRoleDataBundle,
  getManagementRegistryData,
  getResidentHomeData,
  toInvoice,
} from "@/shared/lib/domera-api.server";
import { apiFetchSafe } from "@/shared/server/api-client";
import { getAuthenticatedContext, type RoleDataBundle } from "@/shared/server/auth-context";

type ApiListResponse = { items?: Record<string, unknown>[] };

export async function getDebtsPageData(roleHint?: string): Promise<RoleDataBundle> {
  const context = await getAuthenticatedContext(roleHint);

  if (context.role === "managementCompany") {
    return getManagementRegistryData(context, { includeInvoices: true });
  }

  const bundle = emptyRoleDataBundle(context);
  const invoicesResponse = await apiFetchSafe<ApiListResponse>("/invoices");

  return {
    ...bundle,
    invoices: Array.isArray(invoicesResponse?.items) ? invoicesResponse.items.map(toInvoice) : [],
  };
}

export async function getElectricityPageData(roleHint?: string): Promise<RoleDataBundle> {
  return getInvoicesPageData(roleHint);
}

export async function getInvoicesPageData(roleHint?: string): Promise<RoleDataBundle> {
  const context = await getAuthenticatedContext(roleHint);

  if (context.role === "managementCompany") {
    return getManagementRegistryData(context, {
      includeBuildings: true,
      includeApartments: true,
      includeInvoices: true,
    });
  }

  const [residentData, invoicesResponse] = await Promise.all([
    getResidentHomeData(context),
    apiFetchSafe<ApiListResponse>("/invoices"),
  ]);

  return {
    ...residentData,
    invoices: Array.isArray(invoicesResponse?.items) ? invoicesResponse.items.map(toInvoice) : [],
  };
}
