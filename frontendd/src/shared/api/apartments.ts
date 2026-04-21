import { apiFetch } from "@/shared/api/client";

export type ApartmentRecord = Record<string, unknown>;

export type ApartmentsQuery = {
  companyId?: string;
  buildingId?: string;
  residentId?: string;
};

export type ApartmentMutationResponse = {
  success?: boolean;
  id?: string;
  items?: ApartmentRecord[];
} & Record<string, unknown>;

export type ImportApartmentsParams = {
  file: File | Blob;
  buildingId: string;
  companyId: string;
  fileName?: string;
};

function buildQueryString(query?: ApartmentsQuery) {
  const params = new URLSearchParams();

  if (query?.companyId) params.set("companyId", query.companyId);
  if (query?.buildingId) params.set("buildingId", query.buildingId);
  if (query?.residentId) params.set("residentId", query.residentId);

  const output = params.toString();
  return output ? `?${output}` : "";
}

export function getApartments(query?: ApartmentsQuery | string) {
  const resolvedQuery = typeof query === "string" ? { companyId: query } : query;
  return apiFetch<{ items?: ApartmentRecord[] }>(`/apartments${buildQueryString(resolvedQuery)}`);
}

export function getApartmentById(apartmentId: string) {
  return apiFetch<ApartmentRecord>(`/apartments/${encodeURIComponent(apartmentId)}`);
}

export function createApartment(payload: Record<string, unknown>) {
  return apiFetch<ApartmentMutationResponse>("/apartments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateApartment(apartmentId: string, payload: Record<string, unknown>) {
  return apiFetch<ApartmentMutationResponse>(`/apartments/${encodeURIComponent(apartmentId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteApartment(apartmentId: string) {
  return apiFetch<ApartmentMutationResponse>(`/apartments/${encodeURIComponent(apartmentId)}`, {
    method: "DELETE",
  });
}

export function inviteApartmentTenant(apartmentId: string, email: string) {
  return apiFetch<ApartmentMutationResponse>(`/apartments/${encodeURIComponent(apartmentId)}/tenants/invite`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function removeApartmentTenant(apartmentId: string, tenantUserId: string) {
  return apiFetch<ApartmentMutationResponse>(
    `/apartments/${encodeURIComponent(apartmentId)}/tenants/${encodeURIComponent(tenantUserId)}`,
    {
      method: "DELETE",
    },
  );
}

export function unassignApartmentResident(apartmentId: string) {
  return apiFetch<ApartmentMutationResponse>(`/apartments/${encodeURIComponent(apartmentId)}/unassign-resident`, {
    method: "POST",
  });
}

export function importApartments(params: ImportApartmentsParams) {
  const formData = new FormData();
  formData.append("file", params.file, params.fileName ?? "apartments.xlsx");
  formData.append("buildingId", params.buildingId);
  formData.append("companyId", params.companyId);

  return apiFetch<ApartmentMutationResponse>("/apartments/import", {
    method: "POST",
    body: formData,
  });
}
