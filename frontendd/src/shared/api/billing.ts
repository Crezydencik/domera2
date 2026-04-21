import { apiFetch } from "@/shared/api/client";

export function getInvoices(query: { companyId?: string; apartmentId?: string; userId?: string } = {}) {
  const params = new URLSearchParams();

  if (query.companyId) params.set("companyId", query.companyId);
  if (query.apartmentId) params.set("apartmentId", query.apartmentId);
  if (query.userId) params.set("userId", query.userId);

  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<{ items?: Record<string, unknown>[] }>(`/invoices${suffix}`);
}
