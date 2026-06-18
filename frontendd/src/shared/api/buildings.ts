import { apiFetch } from "@/shared/api/client";
import type { BuildingReadingConfig } from "@/shared/lib/data";

export type AdminBuilding = {
  id: string;
  name?: string;
  title?: string;
  address?: string;
  comment?: string;
  street?: string;
  location?: string;
  companyName?: string;
  companyId?: string;
  companyEmail?: string;
  companyPhone?: string;
  contactEmail?: string;
  contactPhone?: string;
  managerName?: string;
  managedBy?: Record<string, unknown>;
  apartmentsCount?: number;
  occupiedApartments?: number;
  apartments?: number;
  subscriptionTermYears?: number;
  subscriptionTermMonths?: number;
  status?: string;
  reviewComment?: string;
  rejectionComment?: string;
  rejectedReason?: string;
  buildingCreationAccessReviewComment?: string;
  editLocked?: boolean;
};

export type PlatformBillingInvoice = {
  id: string;
  invoiceId?: string;
  invoiceNumber?: string;
  type?: string;
  status?: string;
  currency?: string;
  amount?: number;
  monthlyAmount?: number;
  unitPrice?: number;
  quantity?: number;
  billingPeriod?: string;
  subscriptionTermMonths?: number;
  title?: string;
  description?: string;
  companyId?: string;
  companyName?: string;
  buildingId?: string;
  buildingName?: string;
  buildingAddress?: string;
  requestId?: string;
  requesterEmail?: string;
  invoiceDate?: string;
  dueDate?: string;
  createdAt?: unknown;
};

export function getBuildings(companyId?: string) {
  const query = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
  return apiFetch<{ items?: Record<string, unknown>[] }>(`/buildings${query}`);
}

export type BuildingCreationAccess = {
  allowed: boolean;
  requiresSubscription: boolean;
  requiresCode: boolean;
  message?: string | null;
};

export type BuildingMutationInput = {
  companyId: string;
  name: string;
  address: string;
  comment?: string;
  status?: string;
  apartmentsCount?: number;
  occupiedApartments?: number;
  subscriptionTermYears?: number;
  subscriptionTermMonths?: number;
  readingConfig?: BuildingReadingConfig;
};

export function getBuildingCreationAccess(companyId: string) {
  return apiFetch<BuildingCreationAccess>(`/buildings/creation-access?companyId=${encodeURIComponent(companyId)}`);
}

export function requestBuildingCreationAccess(
  companyId: string,
  building: Omit<BuildingMutationInput, "companyId">,
  options?: { requestId?: string },
) {
  return apiFetch<{ success: boolean; status?: string; alreadyAllowed?: boolean; alreadyPending?: boolean }>(
    "/buildings/creation-access/request",
    {
      method: "POST",
      body: JSON.stringify({ companyId, building, ...options }),
    },
  );
}

export function createBuilding(input: BuildingMutationInput) {
  return apiFetch<{ id: string }>("/buildings", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateBuilding(buildingId: string, input: Omit<BuildingMutationInput, "companyId">) {
  return apiFetch<{ success: boolean }>(`/buildings/${encodeURIComponent(buildingId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteBuilding(buildingId: string) {
  return apiFetch<{ success: boolean }>(`/buildings/${encodeURIComponent(buildingId)}`, {
    method: "DELETE",
  });
}

export function cancelBuildingCreationRequest(requestId: string) {
  return apiFetch<{ success: boolean; status?: string }>(
    `/buildings/creation-access/request/${encodeURIComponent(requestId)}`,
    {
      method: "DELETE",
    },
  );
}

export function getAdminBuildings() {
  return apiFetch<{ items?: AdminBuilding[] }>("/buildings/admin/all");
}

export function getPlatformBillingInvoices() {
  return apiFetch<{ items?: PlatformBillingInvoice[] }>("/buildings/admin/billing-invoices");
}

export function setBuildingEditLock(buildingId: string, locked: boolean) {
  return apiFetch<{ success: boolean; editLocked: boolean }>(
    `/buildings/admin/${encodeURIComponent(buildingId)}/edit-lock`,
    {
      method: "PATCH",
      body: JSON.stringify({ locked }),
    },
  );
}
