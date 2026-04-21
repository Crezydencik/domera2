import { apiFetch } from "@/shared/api/client";

export function getProjects(companyId?: string) {
  const query = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
  return apiFetch<{ items?: Record<string, unknown>[] }>(`/projects${query}`);
}
