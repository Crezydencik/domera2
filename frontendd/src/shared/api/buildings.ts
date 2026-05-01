import { apiFetch } from "@/shared/api/client";
import type { BuildingReadingConfig } from "@/shared/lib/data";

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
  status?: string;
  apartmentsCount?: number;
  occupiedApartments?: number;
  readingConfig?: BuildingReadingConfig;
};

export function getBuildingCreationAccess(companyId: string) {
  return apiFetch<BuildingCreationAccess>(`/buildings/creation-access?companyId=${encodeURIComponent(companyId)}`);
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
