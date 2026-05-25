import { apiFetch } from "@/shared/api/client";

export function getCompany(companyId: string) {
  return apiFetch<Record<string, unknown>>(`/company/${encodeURIComponent(companyId)}`);
}

export function updateCompany(companyId: string, payload: Record<string, unknown>) {
  return apiFetch<{ success?: boolean }>(`/company/${encodeURIComponent(companyId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function addCompanyMember(
  companyId: string,
  payload: {
    email: string;
    firstName: string;
    lastName: string;
    role: "ManagementCompany" | "Accountant";
  },
) {
  return apiFetch<{
    success?: boolean;
    mode?: "attached" | "invitation";
    invitation?: Record<string, unknown>;
    member?: Record<string, unknown>;
  }>(`/company/${encodeURIComponent(companyId)}/members`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function removeCompanyMember(companyId: string, memberId: string) {
  return apiFetch<{ success?: boolean; memberId?: string }>(
    `/company/${encodeURIComponent(companyId)}/members/${encodeURIComponent(memberId)}`,
    {
      method: "DELETE",
    },
  );
}
