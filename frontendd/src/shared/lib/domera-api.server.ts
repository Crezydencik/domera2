import "server-only";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type {
  Building,
  BuildingReadingConfig,
  DocumentItem,
  Invoice,
  MeterReading,
  NotificationItem,
  Resident,
} from "./data";
import { DashboardRole, normalizeDashboardRole } from "../role-ui";
import { ROUTES } from "./routes";
import { buildCookieHeaderFromStore } from "./cookie-header.server";

function resolveServerApiBaseUrl() {
  const configured = process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL;
  if (configured?.startsWith("http://") || configured?.startsWith("https://")) {
    return configured;
  }

  return "http://127.0.0.1:4000/api";
}

const appConfig = {
  name: "Domera",
  apiBaseUrl: resolveServerApiBaseUrl(),
  demoCompanyId: process.env.NEXT_PUBLIC_DEMO_COMPANY_ID ?? "demo-company",
  demoApartmentId: process.env.NEXT_PUBLIC_DEMO_APARTMENT_ID ?? "demo-apartment",
};

const SERVER_API_TIMEOUT_MS = Number(process.env.SERVER_API_TIMEOUT_MS ?? 15000);

type UnknownRecord = Record<string, unknown>;
type ApiListResponse = { items?: UnknownRecord[] };
type ResidentHomeResponse = { apartments?: UnknownRecord[]; buildings?: UnknownRecord[]; managementCompanies?: UnknownRecord[] };

function redirectToExpiredLogin(): never {
  redirect(`${ROUTES.login}?expired=1`);
}

export interface RoleDataBundle {
  role: DashboardRole;
  userId?: string;
  profile?: UnknownRecord;
  companyId?: string;
  apartmentId?: string;
  buildings: Building[];
  apartments: UnknownRecord[];
  residents: Resident[];
  invoices: Invoice[];
  meterReadings: MeterReading[];
  documents: DocumentItem[];
  notifications: NotificationItem[];
  managementCompanies: UnknownRecord[];
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

async function parseJsonResponse<T>(response: Response, path: string): Promise<T> {
  if (response.status === 204 || response.status === 205) {
    return {} as T;
  }

  const raw = await response.text();
  if (!raw.trim()) {
    return {} as T;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new DomeraApiError(`Invalid JSON response for ${path}`, response.status || 500);
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

function firstOptionalString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function decodeCookieValue(value?: string): string | undefined {
  if (!value?.trim()) return undefined;

  try {
    return decodeURIComponent(value.trim());
  } catch {
    return value.trim();
  }
}

function firstDisplayString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return "";
}

function joinNameParts(...values: unknown[]): string | undefined {
  const parts = values
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());

  return parts.length ? parts.join(" ") : undefined;
}

function resolvePersonName(item: UnknownRecord, fallback?: string): string {
  return firstString(
    item.fullName,
    joinNameParts(item.firstName, item.lastName),
    item.name,
    item.displayName,
    item.owner,
    item.email,
    fallback,
  );
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

function firstOptionalNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }

  return undefined;
}

function formatCurrency(value: number, currency = "EUR"): string {
  try {
    return new Intl.NumberFormat("en-IE", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(value);
  } catch {
    return new Intl.NumberFormat("en-IE", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
    }).format(value);
  }
}

function formatDate(value: unknown): string {
  if (value && typeof value === "object") {
    const record = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
    if (typeof record.toDate === "function") {
      return record.toDate().toISOString().slice(0, 10);
    }

    const seconds = typeof record.seconds === "number" ? record.seconds : record._seconds;
    if (typeof seconds === "number") {
      return new Date(seconds * 1000).toISOString().slice(0, 10);
    }
  }

  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }

    return value;
  }

  return "—";
}

function toBuilding(item: UnknownRecord): Building {
  const apartmentIds = Array.isArray(item.apartmentIds)
    ? item.apartmentIds.filter((entry): entry is string => typeof entry === "string")
    : [];
  const rawReadingConfig = item.readingConfig && typeof item.readingConfig === "object"
    ? (item.readingConfig as UnknownRecord)
    : null;
  const readingConfig: BuildingReadingConfig | undefined = rawReadingConfig
    ? {
        waterEnabled: Boolean(rawReadingConfig.waterEnabled),
        electricityEnabled: Boolean(rawReadingConfig.electricityEnabled),
        heatingEnabled: Boolean(rawReadingConfig.heatingEnabled),
        hotWaterMetersPerResident: Math.max(0, firstNumber(rawReadingConfig.hotWaterMetersPerResident)),
        coldWaterMetersPerResident: Math.max(0, firstNumber(rawReadingConfig.coldWaterMetersPerResident)),
        submissionPeriod: rawReadingConfig.submissionPeriod && typeof rawReadingConfig.submissionPeriod === "object"
          ? {
              startDate: firstDisplayString((rawReadingConfig.submissionPeriod as UnknownRecord).startDate),
              endDate: firstDisplayString((rawReadingConfig.submissionPeriod as UnknownRecord).endDate),
              monthly: Boolean((rawReadingConfig.submissionPeriod as UnknownRecord).monthly),
            }
          : null,
      }
    : undefined;

  const apartmentCount = firstNumber(item.apartmentsCount, apartmentIds.length, item.apartments);
  const apartmentLimit = firstOptionalNumber(item.apartmentLimit, item.approvedApartmentsCount, item.apartments);
  const occupied = firstNumber(item.occupiedApartments, item.occupied);

  return {
    id: firstString(item.id, item.buildingId, item.name),
    name: firstString(item.name, item.title, item.address, item.id),
    address: firstString(item.address, item.street, item.location),
    apartments: apartmentCount,
    apartmentLimit,
    occupancy: apartmentCount > 0 ? `${Math.max(0, occupied)} / ${apartmentCount}` : "—",
    status: String(item.status ?? "Healthy"),
    reviewComment: firstOptionalString(
      item.reviewComment,
      item.rejectionComment,
      item.rejectedReason,
      item.buildingCreationAccessReviewComment,
    ),
    rejectionComment: firstOptionalString(item.rejectionComment, item.reviewComment, item.rejectedReason),
    rejectedReason: firstOptionalString(item.rejectedReason, item.rejectionComment, item.reviewComment),
    buildingCreationAccessReviewComment: firstOptionalString(
      item.buildingCreationAccessReviewComment,
      item.reviewComment,
      item.rejectionComment,
    ),
    reviewedAt: item.reviewedAt,
    readingConfig,
    companyId: typeof item.companyId === "string" ? item.companyId : undefined,
    companyName: typeof item.companyName === "string" ? item.companyName : undefined,
    managedBy: item.managedBy && typeof item.managedBy === "object" ? (item.managedBy as Record<string, unknown>) : undefined,
    editLocked: item.editLocked === true,
  };
}

function toResident(
  item: UnknownRecord,
  context?: { apartment?: string; building?: string; role?: string; fallbackId?: string },
): Resident {
  const residentId = firstString(item.id, item.uid, item.email, context?.fallbackId);

  return {
    id: residentId,
    fullName: resolvePersonName(item, residentId),
    email: typeof item.email === "string" && item.email.trim() ? item.email.trim() : undefined,
    phone: typeof item.phone === "string" && item.phone.trim() ? item.phone.trim() : undefined,
    position: typeof item.position === "string" && item.position.trim() ? item.position.trim() : undefined,
    jobTitle: typeof item.jobTitle === "string" && item.jobTitle.trim() ? item.jobTitle.trim() : undefined,
    comment: typeof item.comment === "string" && item.comment.trim() ? item.comment.trim() : undefined,
    showContactToResidents: item.showContactToResidents === true,
    apartment: firstString(item.apartment, item.apartmentNumber, item.apartmentId, context?.apartment),
    building: firstString(item.building, item.buildingName, item.companyId, context?.building),
    role: firstString(item.role, item.accountType, context?.role, "Resident"),
    invitationStatus: firstString(item.invitationStatus, item.status, "Active"),
  };
}

function isProxyableInvoicePdfUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "firebasestorage.googleapis.com" || url.hostname === "storage.googleapis.com")
    );
  } catch {
    return false;
  }
}

function buildInvoicePdfHref(id: string, item: UnknownRecord) {
  const pdfUrl = typeof item.pdfUrl === "string" ? item.pdfUrl.trim() : "";
  const hasStoragePath = typeof item.storagePath === "string" && item.storagePath.trim();
  const canUseProxy = hasStoragePath || (pdfUrl && isProxyableInvoicePdfUrl(pdfUrl));

  return canUseProxy && id !== "вЂ”" && id !== "—"
    ? `/api/invoices/${encodeURIComponent(id)}/pdf`
    : pdfUrl || undefined;
}

function toInvoice(item: UnknownRecord): Invoice {
  const currency = firstString(item.currency, "EUR");
  const id = firstString(item.id, item.invoiceId);
  const accountNumber = firstDisplayString(
    item.accountId,
    item.personalAccountId,
    item.billingAccountId,
    item.clientNumber,
    item.customerNumber,
    item.clientId,
    item.customerId,
  );
  const contractNumber = firstDisplayString(
    item.contractNumber,
    item.contractNo,
    item.contractId,
    item.agreementNumber,
  );
  const apartmentNumber = firstDisplayString(
    item.apartmentNumber,
    item.number,
    item.apartmentNo,
    item.flatNumber,
    item.apartment,
  );
  const buildingNumber = firstDisplayString(
    item.buildingNumber,
    item.houseNumber,
    item.buildingNo,
    item.building,
    item.buildingId,
  );
  const displayNumber = firstDisplayString(
    accountNumber,
    contractNumber,
    apartmentNumber,
    buildingNumber,
    item.externalId,
    id,
  );

  return {
    id,
    displayNumber,
    apartment: firstString(item.apartment, item.apartmentNumber, item.apartmentId),
    resident: firstString(item.resident, item.residentName, item.userId, item.email),
    amount: formatCurrency(firstNumber(item.amount), currency),
    dueDate: formatDate(item.dueDate ?? item.invoiceDate ?? item.createdAt),
    status: firstString(item.status, "Pending").replace(/^./, (value) => value.toUpperCase()),
    apartmentId: typeof item.apartmentId === "string" ? item.apartmentId : undefined,
    buildingId: typeof item.buildingId === "string" ? item.buildingId : undefined,
    companyId: typeof item.companyId === "string" ? item.companyId : undefined,
    accountNumber: accountNumber || undefined,
    contractNumber: contractNumber || undefined,
    apartmentNumber: apartmentNumber || undefined,
    buildingNumber: buildingNumber || undefined,
    externalId: typeof item.externalId === "string" ? item.externalId : undefined,
    period: typeof item.period === "string" ? item.period : undefined,
    invoiceDate: item.invoiceDate ? formatDate(item.invoiceDate) : undefined,
    fileName: firstDisplayString(item.fileName, item.file_name, item.originalFileName, item.original_file_name) || undefined,
    currency,
    comment: typeof item.comment === "string" ? item.comment : undefined,
    pdfUrl: buildInvoicePdfHref(id, item),
  };
}

function toMeterReading(item: UnknownRecord): MeterReading {
  const currentValue = firstNumber(item.currentValue, item.value);
  const previousValue = firstNumber(item.previousValue);
  const consumption = firstNumber(item.consumption, currentValue - previousValue);
  const month = firstOptionalNumber(item.month);
  const year = firstOptionalNumber(item.year);
  const meterKey = typeof item.meterKey === "string" && item.meterKey.trim() ? item.meterKey.trim() : undefined;
  const serialNumber =
    typeof item.serialNumber === "string" && item.serialNumber.trim() ? item.serialNumber.trim() : undefined;
  const value = currentValue;
  const trend = consumption;

  return {
    id: firstString(item.id, item.meterId),
    apartmentId: typeof item.apartmentId === "string" && item.apartmentId.trim() ? item.apartmentId.trim() : undefined,
    buildingId: typeof item.buildingId === "string" && item.buildingId.trim() ? item.buildingId.trim() : undefined,
    apartment: firstString(item.apartment, item.apartmentNumber, item.apartmentId),
    value: `${value || 0} m³`,
    submittedAt: formatDate(item.submittedAt),
    trend: `${trend || 0}`,
    month,
    year,
    meterKey,
    serialNumber,
    previousValue,
    currentValue,
    consumption,
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

function getLinkedCompanyIds(apartments: UnknownRecord[], buildings: Building[], extraValues: unknown[] = []) {
  const ids = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === "string" && value.trim() && value.trim() !== "â€”") {
      ids.add(value.trim());
    }
  };

  for (const apartment of apartments) {
    add(apartment.companyId);
    add(apartment.managementCompanyId);
    add(apartment.managerCompanyId);
    if (Array.isArray(apartment.companyIds)) apartment.companyIds.forEach(add);
    const managedBy = apartment.managedBy && typeof apartment.managedBy === "object"
      ? (apartment.managedBy as UnknownRecord)
      : null;
    add(managedBy?.companyId);
  }

  for (const building of buildings) {
    add(building.companyId);
    add(building.managedBy?.companyId);
  }

  extraValues.forEach(add);

  return Array.from(ids);
}

function companyFallbacksFromBuildings(buildings: Building[]): UnknownRecord[] {
  return buildings
    .map<UnknownRecord | null>((building) => {
      const managedBy = building.managedBy && typeof building.managedBy === "object" ? building.managedBy : {};
      const id = firstDisplayString(building.companyId, managedBy.companyId, building.companyName);
      const companyName = firstDisplayString(building.companyName, managedBy.companyName, managedBy.name, managedBy.title);

      return id || companyName
        ? {
            id: id || companyName,
            companyName,
            companyEmail: firstDisplayString(managedBy.companyEmail, managedBy.email, managedBy.contactEmail),
            companyPhone: firstDisplayString(managedBy.companyPhone, managedBy.phone, managedBy.contactPhone),
          }
        : null;
    })
    .filter((company): company is UnknownRecord => company !== null);
}

function deriveResidentsFromApartments(apartments: UnknownRecord[]): Resident[] {
  const output: Resident[] = [];

  for (const apartment of apartments) {
    const apartmentLabel = firstString(apartment.number, apartment.apartmentNumber, apartment.id);
    const buildingLabel = firstString(apartment.address, apartment.buildingName, apartment.buildingId);

    if (typeof apartment.residentId === "string" && apartment.residentId.trim()) {
      output.push({
        id: apartment.residentId.trim(),
        fullName: firstString(
          joinNameParts(apartment.residentFirstName, apartment.residentLastName),
          apartment.residentName,
          apartment.residentEmail,
          apartment.residentId,
        ),
        email: typeof apartment.residentEmail === "string" && apartment.residentEmail.trim() ? apartment.residentEmail.trim() : undefined,
        phone: typeof apartment.residentPhone === "string" && apartment.residentPhone.trim() ? apartment.residentPhone.trim() : undefined,
        apartment: apartmentLabel,
        building: buildingLabel,
        role: "Resident",
        invitationStatus: "Active",
      });
    }

    if (typeof apartment.ownerEmail === "string" && apartment.ownerEmail.trim()) {
      output.push({
        id: apartment.ownerEmail,
        fullName: firstString(joinNameParts(apartment.ownerFirstName, apartment.ownerLastName), apartment.owner, apartment.ownerEmail),
        email: apartment.ownerEmail,
        phone: typeof apartment.ownerPhone === "string" && apartment.ownerPhone.trim() ? apartment.ownerPhone.trim() : undefined,
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
          fullName: firstString(
            joinNameParts(tenantRecord.firstName, tenantRecord.lastName),
            tenantRecord.fullName,
            tenantRecord.name,
            tenantRecord.email,
          ),
          email: typeof tenantRecord.email === "string" && tenantRecord.email.trim() ? tenantRecord.email.trim() : undefined,
          phone: typeof tenantRecord.phone === "string" && tenantRecord.phone.trim() ? tenantRecord.phone.trim() : undefined,
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
  const cookieHeader = buildCookieHeaderFromStore(store);
  const url = `${appConfig.apiBaseUrl}${path}`;
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
  const headers = new Headers(init?.headers);
  const controller = init?.signal ? null : new AbortController();
  const timeout = controller
    ? setTimeout(() => controller.abort(), Math.max(1000, SERVER_API_TIMEOUT_MS))
    : null;

  if (!isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (cookieHeader && !headers.has("Cookie")) {
    headers.set("Cookie", cookieHeader);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers,
      signal: init?.signal ?? controller?.signal,
      cache: "no-store",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new DomeraApiError(`Fetch failed for ${path} (${url}): ${message}`, 500);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }

  if (!response.ok) {
    throw new DomeraApiError(`Request failed for ${path}`, response.status);
  }

  return parseJsonResponse<T>(response, path);
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
  const userId = decodeCookieValue(store.get("userId")?.value);
  const email = decodeCookieValue(store.get("userEmail")?.value);
  const name = decodeCookieValue(store.get("userName")?.value);
  const roleCookie = firstOptionalString(
    store.get("domera_role")?.value,
    store.get("domera_accountType")?.value,
    roleHint,
  );
  const companyIdCookie = decodeCookieValue(store.get("domera_companyId")?.value);
  const apartmentIdCookie = decodeCookieValue(store.get("domera_apartmentId")?.value);

  if (!sessionCookie) {
    redirectToExpiredLogin();
  }

  const fallbackProfile: UnknownRecord = {
    uid: userId,
    id: userId,
    email,
    name,
    role: roleCookie,
    accountType: store.get("domera_accountType")?.value,
    companyId: companyIdCookie,
    apartmentId: apartmentIdCookie,
  };
  const fallbackRole = normalizeDashboardRole(roleCookie);
  const fallbackContext = {
    userId,
    profile: fallbackProfile,
    role: fallbackRole,
    companyId: firstString(companyIdCookie, userId),
    apartmentId: firstString(apartmentIdCookie),
  };

  try {
    const profile = await apiFetch<UnknownRecord>(
      userId ? `/users/${encodeURIComponent(userId)}` : "/users/me",
    );
    const resolvedUserId = firstString(profile?.uid, profile?.id, userId);
    const role = normalizeDashboardRole(
      firstString(
        profile?.role,
        profile?.accountType,
        store.get("domera_role")?.value,
        store.get("domera_accountType")?.value,
        roleHint,
      ),
    );

    return {
      userId: resolvedUserId,
      profile,
      role,
      companyId: firstString(profile?.companyId, store.get("domera_companyId")?.value, resolvedUserId),
      apartmentId: firstString(profile?.apartmentId, store.get("domera_apartmentId")?.value),
    };
  } catch (error) {
    if (error instanceof DomeraApiError && [401, 403].includes(error.status)) {
      redirectToExpiredLogin();
    }

    if (error instanceof DomeraApiError && error.status === 404) {
      return fallbackContext;
    }

    throw error;
  }
}

export async function getRoleDataBundle(roleHint?: string): Promise<RoleDataBundle> {
  const { userId, profile, role, companyId, apartmentId } = await getAuthenticatedContext(roleHint);

  if (role === "platformAdmin") {
    const usersResponse = await apiFetchSafe<ApiListResponse>("/users");
    const platformUsers = Array.isArray(usersResponse?.items) ? usersResponse.items.map((item) => toResident(item)) : [];

    return {
      role,
      userId,
      profile,
      companyId,
      apartmentId,
      buildings: [],
      apartments: [],
      residents: platformUsers,
      invoices: [],
      meterReadings: [],
      documents: [],
      notifications: [],
      managementCompanies: [],
    };
  }

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
    const liveResidents = Array.isArray(residentsResponse?.items) ? residentsResponse.items.map((item) => toResident(item)) : [];
    const supplementalResidents = deriveResidentsFromApartments(liveApartments);

    const mergedResidents = Array.from(
      new Map([...supplementalResidents, ...liveResidents].map((resident) => [resident.id, resident])).values(),
    );
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
      profile,
      companyId,
      apartmentId,
      buildings: liveBuildings,
      apartments: liveApartments,
      residents: mergedResidents,
      invoices: liveInvoices,
      meterReadings: liveMeterReadings,
      documents: liveDocuments,
      notifications: liveNotifications,
      managementCompanies: [],
    };
  }

  const [residentHome, notificationsResponse] = await Promise.all([
    apiFetchSafe<ResidentHomeResponse>("/resident/apartments"),
    userId
      ? apiFetchSafe<ApiListResponse>(`/notifications?userId=${encodeURIComponent(userId)}`)
      : Promise.resolve(null),
  ]);
  const liveApartments = Array.isArray(residentHome?.apartments) && residentHome.apartments.length
    ? residentHome.apartments
    : apartmentId && apartmentId !== "вЂ”"
      ? [{ id: apartmentId, apartmentId }]
      : [];
  const liveBuildings = Array.isArray(residentHome?.buildings) ? residentHome.buildings.map(toBuilding) : [];
  const residentHomeCompanies = Array.isArray(residentHome?.managementCompanies) ? residentHome.managementCompanies : [];
  const apartmentIds = liveApartments
    .map((item) => firstString(item.id, item.apartmentId))
    .filter((value) => value !== "—");

  const targetApartmentIds = apartmentIds.length
    ? apartmentIds
    : apartmentId && apartmentId !== "—"
      ? [apartmentId]
      : [];

  const linkedCompanyIds = getLinkedCompanyIds(liveApartments, liveBuildings, [profile?.companyId, companyId]);
  const knownCompanyIds = new Set(
    residentHomeCompanies
      .map((company) => firstDisplayString(company.id, company.companyId, company.companyName))
      .filter(Boolean),
  );
  const companyIdsToLoad = linkedCompanyIds.filter((id) => !knownCompanyIds.has(id));
  const [invoicesResponse, meterReadingsResponse, documentsResponse, companyBatches] = await Promise.all([
    apiFetchSafe<ApiListResponse>("/invoices"),
    apiFetchSafe<ApiListResponse>("/meter-readings"),
    apiFetchSafe<ApiListResponse>("/documents"),
    Promise.all(
      companyIdsToLoad.map((item) => apiFetchSafe<UnknownRecord>(`/company/${encodeURIComponent(item)}`)),
    ),
  ]);

  const mergedInvoices = Array.isArray(invoicesResponse?.items) ? invoicesResponse.items.map(toInvoice) : [];
  const mergedMeterReadings = Array.isArray(meterReadingsResponse?.items)
    ? meterReadingsResponse.items.map(toMeterReading)
    : [];
  const liveDocuments = Array.isArray(documentsResponse?.items) ? documentsResponse.items.map(toDocument) : [];
  const derivedResidents = deriveResidentsFromApartments(liveApartments);
  const liveNotifications = Array.isArray(notificationsResponse?.items)
    ? notificationsResponse.items.map(toNotification)
    : [];
  const managementCompanies = Array.from(
    new Map(
      [...companyBatches.filter((item): item is UnknownRecord => Boolean(item)), ...companyFallbacksFromBuildings(liveBuildings)]
        .concat(residentHomeCompanies)
        .map((company) => [firstDisplayString(company.id, company.companyId, company.companyName), company] as const)
        .filter(([key]) => Boolean(key)),
    ).values(),
  );

  return {
    role,
    userId,
    profile,
    companyId,
    apartmentId,
    buildings: liveBuildings,
    apartments: liveApartments,
    residents: derivedResidents,
    invoices: mergedInvoices,
    meterReadings: mergedMeterReadings,
    documents: liveDocuments,
    notifications: liveNotifications,
    managementCompanies,
  };
}

export const domeraService = {
  getRoleDataBundle,
};
