import { apiFetch } from "@/shared/api/client";

export function getDocuments(companyId?: string) {
  const query = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
  return apiFetch<{ items?: Record<string, unknown>[] }>(`/news${query}`);
}
