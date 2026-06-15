import { apiFetch } from "@/shared/api/client";

export type PlatformUser = {
  id?: string;
  uid?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  companyName?: string;
  companyId?: string;
  role?: string;
  accountType?: string;
  canCreateBuildings?: boolean;
};

export function getPlatformUsers() {
  return apiFetch<{ items?: PlatformUser[] }>("/users");
}

export function setBuildingCreationAccess(userId: string, canCreateBuildings: boolean, companyId?: string) {
  return apiFetch<{ success: boolean; canCreateBuildings: boolean }>(
    `/users/${encodeURIComponent(userId)}/building-creation-access`,
    {
      method: "PATCH",
      body: JSON.stringify({ canCreateBuildings, companyId }),
    },
  );
}
