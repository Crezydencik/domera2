import { apiFetchSafe } from "@/shared/server/api-client";
import { getAuthenticatedContext, type RoleDataBundle } from "@/shared/server/auth-context";
import {
  getManagementRegistryData,
  getResidentHomeData,
  toInvoice,
  toMeterReading,
  toNotification,
} from "@/shared/lib/domera-api.server";

type ApiListResponse = { items?: Record<string, unknown>[] };

export async function getNotificationsPageData(roleHint?: string): Promise<RoleDataBundle> {
  const context = await getAuthenticatedContext(roleHint);

  if (context.role === "managementCompany") {
    return getManagementRegistryData(context, {
      includeApartments: true,
      includeInvoices: true,
      includeMeterReadings: true,
      includeNotifications: true,
    });
  }

  const [residentData, invoicesResponse, meterReadingsResponse, notificationsResponse] = await Promise.all([
    getResidentHomeData(context),
    apiFetchSafe<ApiListResponse>("/invoices"),
    apiFetchSafe<ApiListResponse>("/meter-readings"),
    context.userId
      ? apiFetchSafe<ApiListResponse>(`/notifications?userId=${encodeURIComponent(context.userId)}`)
      : Promise.resolve(null),
  ]);

  return {
    ...residentData,
    invoices: Array.isArray(invoicesResponse?.items) ? invoicesResponse.items.map(toInvoice) : [],
    meterReadings: Array.isArray(meterReadingsResponse?.items)
      ? meterReadingsResponse.items.map(toMeterReading)
      : [],
    notifications: Array.isArray(notificationsResponse?.items)
      ? notificationsResponse.items.map(toNotification)
      : [],
  };
}
