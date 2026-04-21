import { apiFetch } from "@/shared/api/client";

export function getMeterReadings(query: { companyId?: string; apartmentId?: string } = {}) {
  const params = new URLSearchParams();

  if (query.companyId) params.set("companyId", query.companyId);
  if (query.apartmentId) params.set("apartmentId", query.apartmentId);

  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<{ items?: Record<string, unknown>[] }>(`/meter-readings${suffix}`);
}
