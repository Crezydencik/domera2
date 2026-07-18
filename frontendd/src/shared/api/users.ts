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
  companyPhone?: string;
  phone?: string;
  phoneNumber?: string;
  mobile?: string;
  telephone?: string;
  role?: string;
  accountType?: string;
  canCreateBuildings?: boolean;
  buildingCreationRequestStatus?: string;
  buildingCreationRequestId?: string;
  buildingCreationRequestBuildingName?: string;
  buildingCreationRequestBuildingAddress?: string;
  buildingCreationAccessRequestedAt?: unknown;
  buildingCreationRequests?: {
    id?: string;
    requestId?: string;
    buildingName?: string;
    buildingAddress?: string;
    comment?: string;
    buildingComment?: string;
    building?: Record<string, unknown>;
    companyId?: string;
    companyName?: string;
    apartmentsCount?: number;
    apartments?: number;
    subscriptionTermYears?: number;
    subscriptionDurationYears?: number;
    subscriptionTermMonths?: number;
    subscriptionDurationMonths?: number;
    subscriptionPricePerApartment?: number;
    pricePerApartment?: number;
    monthlyPricePerApartment?: number;
    requestedAt?: unknown;
    status?: string;
  }[];
};

export function getPlatformUsers() {
  return apiFetch<{ items?: PlatformUser[] }>("/users");
}

export function setBuildingCreationAccess(
  userId: string,
  approved: boolean,
  companyId?: string,
  requestId?: string,
  options?: {
    subscriptionPricePerApartment?: number;
    reviewComment?: string;
    rejectionComment?: string;
  },
) {
  return apiFetch<{ success: boolean; status?: string; buildingId?: string; billingInvoiceId?: string }>(
    `/users/${encodeURIComponent(userId)}/building-creation-access`,
    {
      method: "PATCH",
      body: JSON.stringify({ canCreateBuildings: approved, approved, companyId, requestId, ...options }),
    },
  );
}
