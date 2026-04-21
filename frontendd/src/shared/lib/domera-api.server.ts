import "server-only";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type {
  Building,
  DocumentItem,
  Invoice,
  MeterReading,
  NotificationItem,
  Resident,
} from "./data";
import { DashboardRole, normalizeDashboardRole } from "../role-ui";
import { ROUTES } from "./routes";

const appConfig = {
  name: "Domera",
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api",
  demoCompanyId: process.env.NEXT_PUBLIC_DEMO_COMPANY_ID ?? "demo-company",
  demoApartmentId: process.env.NEXT_PUBLIC_DEMO_APARTMENT_ID ?? "demo-apartment",
};

type UnknownRecord = Record<string, unknown>;
type ApiListResponse = { items?: UnknownRecord[] };
type ResidentHomeResponse = { apartments?: UnknownRecord[]; buildings?: UnknownRecord[] };

export interface RoleDataBundle {
  role: DashboardRole;
  userId?: string;
  companyId?: string;
  apartmentId?: string;
  buildings: Building[];
  apartments: UnknownRecord[];
  residents: Resident[];
  invoices: Invoice[];
  meterReadings: MeterReading[];
  documents: DocumentItem[];
  notifications: NotificationItem[];
}

export class DomeraApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "DomeraApiError";
  }
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "—";
}

function firstNumber(...values: unknown[]): number {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }

  return 0;
}

const currencyFormatter = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

function formatDate(value: unknown): string {
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }

    return value;
  }

  return "—";
}

function buildCookieHeader(store: Awaited<ReturnType<typeof cookies>>): string {
  return store
    .getAll()
    .map((item) => `${item.name}=${item.value}`)
    .join("; ");
}

function toBuilding(item: UnknownRecord): Building {
  const apartmentIds = Array.isArray(item.apartmentIds)
    ? item.apartmentIds.filter((entry): entry is string => typeof entry === "string")
    : [];

  const apartmentCount = firstNumber(item.apartmentsCount, apartmentIds.length, item.apartments);
  const occupied = firstNumber(item.occupiedApartments, item.occupied);

  return {
    id: firstString(item.id, item.buildingId, item.name),
    name: firstString(item.name, item.title, item.address, item.id),
    address: firstString(item.address, item.street, item.location),
    apartments: apartmentCount,
    occupancy: apartmentCount > 0 ? `${occupied || apartmentCount} / ${apartmentCount}` : "—",
    status: String(item.status ?? "Healthy"),
  };
}

function toResident(item: UnknownRecord): Resident {
  return {
    id: firstString(item.id, item.uid, item.email),
    fullName: firstString(item.fullName, item.name, item.displayName, item.owner, item.email),
    apartment: firstString(item.apartment, item.apartmentNumber, item.apartmentId),
    building: firstString(item.building, item.buildingName, item.companyId),
    role: firstString(item.role, item.accountType),
    invitationStatus: firstString(item.invitationStatus, item.status, "Active"),
  };
}

function toInvoice(item: UnknownRecord): Invoice {
  return {
    id: firstString(item.id, item.invoiceId),
    apartment: firstString(item.apartment, item.apartmentNumber, item.apartmentId),
    resident: firstString(item.resident, item.residentName, item.userId, item.email),
    amount: formatCurrency(firstNumber(item.amount)),
    dueDate: formatDate(item.dueDate ?? item.createdAt),
    status: firstString(item.status, "Pending").replace(/^./, (value) => value.toUpperCase()),
  };
}

function toMeterReading(item: UnknownRecord): MeterReading {
  const value = firstNumber(item.currentValue, item.value, item.consumption);
  const trend = firstNumber(item.consumption, item.currentValue);

  return {
    id: firstString(item.id, item.meterId),
    apartment: firstString(item.apartment, item.apartmentNumber, item.apartmentId),
    value: `${value || 0} m³`,
    submittedAt: formatDate(item.submittedAt),
    trend: `${trend || 0}`,
  };
}

function toNotification(item: UnknownRecord): NotificationItem {
  return {
    id: firstString(item.id),
    title: firstString(item.title, item.subject, "Update"),
    description: firstString(item.description, item.message, item.body, "No details available."),
    channel: firstString(item.channel, item.type, "General"),
  };
}

function toDocument(item: UnknownRecord): DocumentItem {
  return {
    id: firstString(item.id),
    title: firstString(item.title, item.name, "Company update"),
    type: firstString(item.type, item.category, "News"),
    target: firstString(item.target, item.companyId, item.audience, "Workspace"),
    updatedAt: formatDate(item.updatedAt ?? item.createdAt),
  };
}

function deriveResidentsFromApartments(apartments: UnknownRecord[]): Resident[] {
  const output: Resident[] = [];

  for (const apartment of apartments) {
    const apartmentLabel = firstString(apartment.number, apartment.apartmentNumber, apartment.id);
    const buildingLabel = firstString(apartment.address, apartment.buildingName, apartment.buildingId);

    if (typeof apartment.ownerEmail === "string" && apartment.ownerEmail.trim()) {
      output.push({
        id: apartment.ownerEmail,
        fullName: firstString(apartment.owner, apartment.ownerEmail),
        apartment: apartmentLabel,
        building: buildingLabel,
        role: "Landlord",
        invitationStatus: "Active",
      });
    }

    if (Array.isArray(apartment.tenants)) {
      for (const tenant of apartment.tenants) {
        if (!tenant || typeof tenant !== "object") continue;
        const tenantRecord = tenant as UnknownRecord;
        output.push({
          id: firstString(tenantRecord.userId, tenantRecord.email),
          fullName: firstString(tenantRecord.name, tenantRecord.email),
          apartment: apartmentLabel,
          building: buildingLabel,
          role: "Resident",
          invitationStatus: firstString(tenantRecord.status, "Active"),
        });
      }
    }
  }

  return output;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const store = await cookies();
  const cookieHeader = buildCookieHeader(store);

  const response = await fetch(`${appConfig.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new DomeraApiError(`Request failed for ${path}`, response.status);
  }

  return (await response.json()) as T;
}

async function apiFetchSafe<T>(path: string): Promise<T | null> {
  try {
    return await apiFetch<T>(path);
  } catch {
    return null;
  }
}

async function getAuthenticatedContext(roleHint?: string) {
  const store = await cookies();
  const sessionCookie = store.get("__session")?.value?.trim();
  const userId = store.get("userId")?.value?.trim();

  if (!sessionCookie || !userId) {
    redirect(ROUTES.login);
  }

  try {
    const profile = await apiFetch<UnknownRecord>(`/users/${encodeURIComponent(userId)}`);
    const role = normalizeDashboardRole(
      firstString(
        profile?.accountType,
        profile?.role,
        store.get("domera_accountType")?.value,
        store.get("domera_role")?.value,
        roleHint,
      ),
    );

    return {
      userId,
      profile,
      role,
      companyId: firstString(profile?.companyId, store.get("domera_companyId")?.value, userId),
      apartmentId: firstString(profile?.apartmentId, store.get("domera_apartmentId")?.value),
    };
  } catch (error) {
    if (error instanceof DomeraApiError && [401, 403, 404].includes(error.status)) {
      redirect(ROUTES.login);
    }

    throw error;
  }
}

export async function getRoleDataBundle(roleHint?: string): Promise<RoleDataBundle> {
  const { userId, role, companyId, apartmentId } = await getAuthenticatedContext(roleHint);

  if (role === "managementCompany") {
    const [buildingsResponse, apartmentsResponse, residentsResponse, invoicesResponse, meterReadingsResponse, notificationsResponse, newsResponse] =
      await Promise.all([
        apiFetchSafe<ApiListResponse>(`/buildings?companyId=${encodeURIComponent(companyId)}`),
        apiFetchSafe<ApiListResponse>(`/apartments?companyId=${encodeURIComponent(companyId)}`),
        apiFetchSafe<ApiListResponse>(`/users?companyId=${encodeURIComponent(companyId)}`),
        apiFetchSafe<ApiListResponse>(`/invoices?companyId=${encodeURIComponent(companyId)}`),
        apiFetchSafe<ApiListResponse>(`/meter-readings?companyId=${encodeURIComponent(companyId)}`),
        userId ? apiFetchSafe<ApiListResponse>(`/notifications?userId=${encodeURIComponent(userId)}`) : Promise.resolve(null),
        apiFetchSafe<ApiListResponse>(`/news?companyId=${encodeURIComponent(companyId)}`),
      ]);

    const liveBuildings = Array.isArray(buildingsResponse?.items) ? buildingsResponse.items.map(toBuilding) : [];
    const liveApartments = Array.isArray(apartmentsResponse?.items) ? apartmentsResponse.items : [];
    const liveResidents = Array.isArray(residentsResponse?.items) ? residentsResponse.items.map(toResident) : [];
    const liveInvoices = Array.isArray(invoicesResponse?.items) ? invoicesResponse.items.map(toInvoice) : [];
    const liveMeterReadings = Array.isArray(meterReadingsResponse?.items)
      ? meterReadingsResponse.items.map(toMeterReading)
      : [];
    const liveNotifications = Array.isArray(notificationsResponse?.items)
      ? notificationsResponse.items.map(toNotification)
      : [];
    const liveDocuments = Array.isArray(newsResponse?.items)
      ? newsResponse.items.map(toDocument)
      : [];

    return {
      role,
      userId,
      companyId,
      apartmentId,
      buildings: liveBuildings,
      apartments: liveApartments,
      residents: liveResidents,
      invoices: liveInvoices,
      meterReadings: liveMeterReadings,
      documents: liveDocuments,
      notifications: liveNotifications,
    };
  }

  const [residentHome, notificationsResponse] = await Promise.all([
    apiFetchSafe<ResidentHomeResponse>("/resident/apartments"),
    userId
      ? apiFetchSafe<ApiListResponse>(`/notifications?userId=${encodeURIComponent(userId)}`)
      : Promise.resolve(null),
  ]);
  const liveApartments = Array.isArray(residentHome?.apartments) ? residentHome.apartments : [];
  const liveBuildings = Array.isArray(residentHome?.buildings) ? residentHome.buildings.map(toBuilding) : [];
  const apartmentIds = liveApartments
    .map((item) => firstString(item.id, item.apartmentId))
    .filter((value) => value !== "—");

  const targetApartmentIds = apartmentIds.length
    ? apartmentIds
    : apartmentId && apartmentId !== "—"
      ? [apartmentId]
      : [];

  const invoiceBatches = await Promise.all(
    targetApartmentIds.map((item) => apiFetchSafe<ApiListResponse>(`/invoices?apartmentId=${encodeURIComponent(item)}`)),
  );

  const meterBatches = await Promise.all(
    targetApartmentIds.map((item) => apiFetchSafe<ApiListResponse>(`/meter-readings?apartmentId=${encodeURIComponent(item)}`)),
  );

  const mergedInvoices = invoiceBatches.flatMap((response) =>
    Array.isArray(response?.items) ? response.items.map(toInvoice) : [],
  );
  const mergedMeterReadings = meterBatches.flatMap((response) =>
    Array.isArray(response?.items) ? response.items.map(toMeterReading) : [],
  );
  const derivedResidents = deriveResidentsFromApartments(liveApartments);
  const liveNotifications = Array.isArray(notificationsResponse?.items)
    ? notificationsResponse.items.map(toNotification)
    : [];

  return {
    role,
    userId,
    companyId,
    apartmentId,
    buildings: liveBuildings,
    apartments: liveApartments,
    residents: derivedResidents,
    invoices: mergedInvoices,
    meterReadings: mergedMeterReadings,
    documents: [],
    notifications: liveNotifications,
  };
}

export const domeraService = {
  getRoleDataBundle,
};
