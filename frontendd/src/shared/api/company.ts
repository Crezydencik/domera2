import { apiFetch } from "@/shared/api/client";

export type CompanyApiKeyItem = {
  id: string;
  label: string;
  trackingId: string;
  keyPrefix: string;
  buildingId: string | null;
  buildingName: string | null;
  status: string;
  scopes: string[];
  permission: string;
  ownerType: string;
  createdAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdByUid: string | null;
};

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
    memberId?: string;
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
    position?: string;
    comment?: string;
    showContactToResidents?: boolean;
    createAccount?: boolean;
    role: "ManagementCompany" | "Accountant";
  },
) {
  return apiFetch<{
    success?: boolean;
    mode?: "attached" | "invitation" | "contact";
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

export function getCompanyApiKeys(companyId: string) {
  return apiFetch<{ items: CompanyApiKeyItem[] }>(`/company/${encodeURIComponent(companyId)}/api-keys`);
}

export function createCompanyApiKey(
  companyId: string,
  payload: {
    label: string;
    buildingId: string;
    ownerType?: "user" | "service";
    permission?: "all" | "restricted" | "read";
  },
) {
  return apiFetch<{ success?: boolean; apiKey: string; item: CompanyApiKeyItem }>(
    `/company/${encodeURIComponent(companyId)}/api-keys`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function revokeCompanyApiKey(companyId: string, keyId: string) {
  return apiFetch<{ success?: boolean; keyId?: string }>(
    `/company/${encodeURIComponent(companyId)}/api-keys/${encodeURIComponent(keyId)}`,
    {
      method: "DELETE",
    },
  );
}
