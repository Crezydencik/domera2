import { apiFetch } from "@/shared/api/client";

export type DocumentScope =
  | "buildingResidents"
  | "apartmentResidents"
  | "apartmentPrivate"
  | "privateApartment"
  | "managementArchive";

export type DocumentRecord = {
  id: string;
  title: string;
  fileName: string;
  mimeType: string;
  size: number;
  scope: DocumentScope;
  companyId?: string;
  buildingId?: string;
  buildingName?: string;
  apartmentId?: string;
  apartmentLabel?: string;
  ownerUserId?: string;
  uploaderRole?: string;
  uploadedAt: string;
  updatedAt: string;
  downloadUrl: string;
};

export function getDocuments(filters?: { apartmentId?: string }) {
  const query = filters?.apartmentId ? `?apartmentId=${encodeURIComponent(filters.apartmentId)}` : "";
  return apiFetch<{ items?: DocumentRecord[] }>(`/documents${query}`);
}

export function uploadDocument(payload: {
  title: string;
  scope: DocumentScope;
  buildingId?: string;
  apartmentId?: string;
  file: File;
}) {
  const formData = new FormData();
  formData.set("title", payload.title);
  formData.set("scope", payload.scope);
  if (payload.buildingId) formData.set("buildingId", payload.buildingId);
  if (payload.apartmentId) formData.set("apartmentId", payload.apartmentId);
  formData.set("file", payload.file);

  return apiFetch<{ item: DocumentRecord }>("/documents/upload", {
    method: "POST",
    body: formData,
  });
}

export function deleteDocument(documentId: string) {
  return apiFetch<{ success: boolean }>(`/documents/${encodeURIComponent(documentId)}`, {
    method: "DELETE",
  });
}

export function updateDocumentAccess(
  documentId: string,
  payload: {
    scope: DocumentScope;
    buildingId?: string;
    apartmentId?: string;
  },
) {
  return apiFetch<{ item: DocumentRecord }>(`/documents/${encodeURIComponent(documentId)}/access`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
