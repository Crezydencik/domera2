import { apiFetch } from "@/shared/api/client";

export function getCompany(companyId: string) {
  return apiFetch<Record<string, unknown>>(`/company/${encodeURIComponent(companyId)}`);
}
