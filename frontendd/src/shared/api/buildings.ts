import { apiFetch } from "@/shared/api/client";

export function getBuildings(companyId?: string) {
  const query = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
  return apiFetch<{ items?: Record<string, unknown>[] }>(`/buildings${query}`);
}
