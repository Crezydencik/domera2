import { apiFetch } from "@/shared/api/client";

export function getResidents(companyId?: string) {
  const query = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
  return apiFetch<{ items?: Record<string, unknown>[] }>(`/users${query}`);
}
