import "server-only";

import type {
  Building,
  BuildingReadingConfig,
  DocumentItem,
  Invoice,
  MeterReading,
  NotificationItem,
  Resident,
} from "./data";
import { isApprovedBuilding } from "@/shared/lib/buildings";
import { apiFetchSafe } from "@/shared/server/api-client";
import { getAuthenticatedContext, type AuthenticatedContext, type RoleDataBundle } from "@/shared/server/auth-context";

type UnknownRecord = Record<string, unknown>;
type ApiListResponse = { items?: UnknownRecord[] };
type ResidentHomeResponse = { apartments?: UnknownRecord[]; buildings?: UnknownRecord[]; managementCompanies?: UnknownRecord[] };

export type { RoleDataBundle } from "@/shared/server/auth-context";

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

function compareApartmentOrder(left: UnknownRecord, right: UnknownRecord): number {
  const leftLabel = firstDisplayString(left.number, left.apartmentNumber, left.id, left.apartmentId);
  const rightLabel = firstDisplayString(right.number, right.apartmentNumber, right.id, right.apartmentId);
  const leftNumber = Number(leftLabel);
  const rightNumber = Number(rightLabel);
  const bothNumeric =
    leftLabel !== "" &&
    rightLabel !== "" &&
    Number.isFinite(leftNumber) &&
    Number.isFinite(rightNumber);

  if (bothNumeric && leftNumber !== rightNumber) {
    return leftNumber - rightNumber;
  }

  return leftLabel.localeCompare(rightLabel, undefined, { numeric: true, sensitivity: "base" });
}

function sortApartmentsByNumber(items: UnknownRecord[]): UnknownRecord[] {
  return [...items].sort(compareApartmentOrder);
}

function getApartmentBuildingId(item: UnknownRecord): string {
  return firstDisplayString(item.buildingId, item.houseId);
}

function getApartmentId(item: UnknownRecord): string {
  return firstDisplayString(item.id, item.apartmentId);
}

function filterApartmentsByBuildings(items: UnknownRecord[], buildings: Building[]): UnknownRecord[] {
  const activeBuildingIds = new Set(buildings.map((building) => building.id).filter(Boolean));
  if (activeBuildingIds.size === 0) return [];

  return items.filter((item) => {
    const buildingId = getApartmentBuildingId(item);
    return Boolean(buildingId && activeBuildingIds.has(buildingId));
  });
}

function filterInvoicesByActiveObjects(items: Invoice[], buildings: Building[], apartments: UnknownRecord[]): Invoice[] {
  const activeBuildingIds = new Set(buildings.map((building) => building.id).filter(Boolean));
  const activeApartmentIds = new Set(apartments.map(getApartmentId).filter(Boolean));
  if (activeBuildingIds.size === 0) return [];

  return items.filter((item) => {
    if (item.buildingId) return activeBuildingIds.has(item.buildingId);
    if (item.apartmentId) return activeApartmentIds.has(item.apartmentId);
    return activeApartmentIds.size > 0;
  });
}

function filterReadingsByActiveObjects(items: MeterReading[], buildings: Building[], apartments: UnknownRecord[]): MeterReading[] {
  const activeBuildingIds = new Set(buildings.map((building) => building.id).filter(Boolean));
  const activeApartmentIds = new Set(apartments.map(getApartmentId).filter(Boolean));
  if (activeBuildingIds.size === 0) return [];

  return items.filter((item) => {
    if (item.buildingId) return activeBuildingIds.has(item.buildingId);
    if (item.apartmentId) return activeApartmentIds.has(item.apartmentId);
    return activeApartmentIds.has(item.apartment);
  });
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

export function toBuilding(item: UnknownRecord): Building {
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
        electricityMeterDigits: Math.min(7, Math.max(5, firstNumber(rawReadingConfig.electricityMeterDigits) || 6)),
        electricityUserSetsDigits: Boolean(rawReadingConfig.electricityUserSetsDigits),
        electricityAllowMultipleMonthlySubmissions: Boolean(rawReadingConfig.electricityAllowMultipleMonthlySubmissions),
        electricityFixedPriceEnabled: Boolean(rawReadingConfig.electricityFixedPriceEnabled),
        electricityPricePerKwh: Math.max(0, firstNumber(rawReadingConfig.electricityPricePerKwh)),
        submissionPeriod: rawReadingConfig.submissionPeriod && typeof rawReadingConfig.submissionPeriod === "object"
          ? {
              startDate: firstDisplayString((rawReadingConfig.submissionPeriod as UnknownRecord).startDate),
              endDate: firstDisplayString((rawReadingConfig.submissionPeriod as UnknownRecord).endDate),
              monthly: Boolean((rawReadingConfig.submissionPeriod as UnknownRecord).monthly),
            }
          : null,
        waterSubmissionPeriod: rawReadingConfig.waterSubmissionPeriod && typeof rawReadingConfig.waterSubmissionPeriod === "object"
          ? {
              startDate: firstDisplayString((rawReadingConfig.waterSubmissionPeriod as UnknownRecord).startDate),
              endDate: firstDisplayString((rawReadingConfig.waterSubmissionPeriod as UnknownRecord).endDate),
              monthly: Boolean((rawReadingConfig.waterSubmissionPeriod as UnknownRecord).monthly),
            }
          : null,
        electricitySubmissionPeriod: rawReadingConfig.electricitySubmissionPeriod && typeof rawReadingConfig.electricitySubmissionPeriod === "object"
          ? {
              startDate: firstDisplayString((rawReadingConfig.electricitySubmissionPeriod as UnknownRecord).startDate),
              endDate: firstDisplayString((rawReadingConfig.electricitySubmissionPeriod as UnknownRecord).endDate),
              monthly: Boolean((rawReadingConfig.electricitySubmissionPeriod as UnknownRecord).monthly),
            }
          : null,
      }
    : undefined;

  const apartmentLimit = firstOptionalNumber(item.apartmentLimit, item.approvedApartmentsCount, item.apartmentsCount, item.apartments);
  const linkedApartmentsCount = firstOptionalNumber(item.linkedApartmentsCount, item.actualApartmentsCount, apartmentIds.length);
  const apartmentCount = apartmentLimit ?? linkedApartmentsCount ?? 0;
  const occupied = firstNumber(item.occupiedApartments, item.occupied);

  return {
    id: firstString(item.id, item.buildingId, item.name),
    name: firstString(item.name, item.title, item.address, item.id),
    address: firstString(item.address, item.street, item.location),
    apartments: apartmentCount,
    apartmentsCount: apartmentCount,
    apartmentLimit,
    approvedApartmentsCount: apartmentLimit,
    linkedApartmentsCount,
    actualApartmentsCount: linkedApartmentsCount,
    occupiedApartments: occupied,
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

export function toResident(
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

export function toInvoice(item: UnknownRecord): Invoice {
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
    meterReadingId: typeof item.meterReadingId === "string" ? item.meterReadingId : undefined,
    externalId: typeof item.externalId === "string" ? item.externalId : undefined,
    period: typeof item.period === "string" ? item.period : undefined,
    invoiceDate: item.invoiceDate ? formatDate(item.invoiceDate) : undefined,
    fileName: firstDisplayString(item.fileName, item.file_name, item.originalFileName, item.original_file_name) || undefined,
    currency,
    comment: typeof item.comment === "string" ? item.comment : undefined,
    pdfUrl: buildInvoicePdfHref(id, item),
  };
}

export function toMeterReading(item: UnknownRecord): MeterReading {
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

export function toNotification(item: UnknownRecord): NotificationItem {
  return {
    id: firstString(item.id),
    title: firstString(item.title, item.subject, "Update"),
    description: firstString(item.description, item.message, item.body, "No details available."),
    channel: firstString(item.channel, item.type, "General"),
  };
}

export function toDocument(item: UnknownRecord): DocumentItem {
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

export function emptyRoleDataBundle(context: AuthenticatedContext): RoleDataBundle {
  return {
    role: context.role,
    userId: context.userId,
    profile: context.profile,
    companyId: context.companyId,
    apartmentId: context.apartmentId,
    buildings: [],
    apartments: [],
    residents: [],
    invoices: [],
    meterReadings: [],
    documents: [],
    notifications: [],
    managementCompanies: [],
  };
}

export async function getResidentHomeData(context: AuthenticatedContext): Promise<RoleDataBundle> {
  const bundle = emptyRoleDataBundle(context);
  const residentHome = await apiFetchSafe<ResidentHomeResponse>("/resident/apartments");
  const liveApartments = Array.isArray(residentHome?.apartments) && residentHome.apartments.length
    ? residentHome.apartments
    : context.apartmentId && context.apartmentId !== "вЂ”"
      ? [{ id: context.apartmentId, apartmentId: context.apartmentId }]
      : [];

  liveApartments.sort(compareApartmentOrder);

  return {
    ...bundle,
    buildings: Array.isArray(residentHome?.buildings) ? residentHome.buildings.map(toBuilding) : [],
    apartments: liveApartments,
    residents: deriveResidentsFromApartments(liveApartments),
    managementCompanies: Array.isArray(residentHome?.managementCompanies) ? residentHome.managementCompanies : [],
  };
}

export async function getManagementRegistryData(
  context: AuthenticatedContext,
  options: {
    includeBuildings?: boolean;
    includeApartments?: boolean;
    includeResidents?: boolean;
    includeDocuments?: boolean;
    includeInvoices?: boolean;
    includeMeterReadings?: boolean;
    includeNotifications?: boolean;
  },
): Promise<RoleDataBundle> {
  const bundle = emptyRoleDataBundle(context);

  if (!context.companyId) {
    return bundle;
  }

  const needsBuildingsForFiltering = Boolean(
    options.includeBuildings ||
    options.includeApartments ||
    options.includeInvoices ||
    options.includeMeterReadings,
  );
  const companyId = encodeURIComponent(context.companyId);
  const [buildingsResponse, apartmentsResponse, residentsResponse, documentsResponse, invoicesResponse, meterReadingsResponse, notificationsResponse] = await Promise.all([
    needsBuildingsForFiltering ? apiFetchSafe<ApiListResponse>(`/buildings?companyId=${companyId}`) : Promise.resolve(null),
    options.includeApartments ? apiFetchSafe<ApiListResponse>(`/apartments?companyId=${companyId}`) : Promise.resolve(null),
    options.includeResidents ? apiFetchSafe<ApiListResponse>(`/users?companyId=${companyId}`) : Promise.resolve(null),
    options.includeDocuments ? apiFetchSafe<ApiListResponse>(`/news?companyId=${companyId}`) : Promise.resolve(null),
    options.includeInvoices ? apiFetchSafe<ApiListResponse>(`/invoices?companyId=${companyId}`) : Promise.resolve(null),
    options.includeMeterReadings ? apiFetchSafe<ApiListResponse>(`/meter-readings?companyId=${companyId}`) : Promise.resolve(null),
    options.includeNotifications && context.userId
      ? apiFetchSafe<ApiListResponse>(`/notifications?userId=${encodeURIComponent(context.userId)}`)
      : Promise.resolve(null),
  ]);

  const liveBuildings = Array.isArray(buildingsResponse?.items) ? buildingsResponse.items.map(toBuilding) : [];
  const approvedLiveBuildings = liveBuildings.filter(isApprovedBuilding);
  const liveApartments = sortApartmentsByNumber(
    filterApartmentsByBuildings(
      Array.isArray(apartmentsResponse?.items) ? apartmentsResponse.items : [],
      approvedLiveBuildings,
    ),
  );
  const liveResidents = Array.isArray(residentsResponse?.items)
    ? residentsResponse.items.map((item) => toResident(item))
    : [];
  const supplementalResidents = options.includeApartments ? deriveResidentsFromApartments(liveApartments) : [];
  const mergedResidents = Array.from(
    new Map([...supplementalResidents, ...liveResidents].map((resident) => [resident.id, resident])).values(),
  );

  const liveInvoices = filterInvoicesByActiveObjects(
    Array.isArray(invoicesResponse?.items) ? invoicesResponse.items.map(toInvoice) : [],
    approvedLiveBuildings,
    liveApartments,
  );
  const liveMeterReadings = filterReadingsByActiveObjects(
    Array.isArray(meterReadingsResponse?.items) ? meterReadingsResponse.items.map(toMeterReading) : [],
    approvedLiveBuildings,
    liveApartments,
  );

  return {
    ...bundle,
    buildings: liveBuildings,
    apartments: liveApartments,
    residents: mergedResidents,
    invoices: liveInvoices,
    meterReadings: liveMeterReadings,
    documents: Array.isArray(documentsResponse?.items) ? documentsResponse.items.map(toDocument) : [],
    notifications: Array.isArray(notificationsResponse?.items)
      ? notificationsResponse.items.map(toNotification)
      : [],
  };
}

export async function getBuildingsPageData(roleHint?: string): Promise<RoleDataBundle> {
  const context = await getAuthenticatedContext(roleHint);

  if (context.role !== "managementCompany") {
    return emptyRoleDataBundle(context);
  }

  return getManagementRegistryData(context, { includeBuildings: true });
}

export async function getApartmentsPageData(roleHint?: string): Promise<RoleDataBundle> {
  const context = await getAuthenticatedContext(roleHint);

  if (context.role === "managementCompany") {
    return getManagementRegistryData(context, {
      includeBuildings: true,
      includeApartments: true,
      includeResidents: true,
    });
  }

  return getResidentHomeData(context);
}

export async function getResidentsPageData(roleHint?: string): Promise<RoleDataBundle> {
  const context = await getAuthenticatedContext(roleHint);

  if (context.role === "managementCompany") {
    return getManagementRegistryData(context, {
      includeBuildings: true,
      includeApartments: true,
      includeResidents: true,
    });
  }

  return getResidentHomeData(context);
}

export async function getDocumentsPageData(roleHint?: string): Promise<RoleDataBundle> {
  const context = await getAuthenticatedContext(roleHint);

  if (context.role === "managementCompany") {
    return getManagementRegistryData(context, {
      includeBuildings: true,
      includeApartments: true,
      includeDocuments: true,
    });
  }

  const [residentData, documentsResponse] = await Promise.all([
    getResidentHomeData(context),
    apiFetchSafe<ApiListResponse>("/documents"),
  ]);

  return {
    ...residentData,
    documents: Array.isArray(documentsResponse?.items) ? documentsResponse.items.map(toDocument) : [],
  };
}

export async function getSettingsPageData(roleHint?: string): Promise<RoleDataBundle> {
  const context = await getAuthenticatedContext(roleHint);

  if (context.role !== "managementCompany") {
    return emptyRoleDataBundle(context);
  }

  return getManagementRegistryData(context, {
    includeBuildings: true,
    includeResidents: true,
  });
}

export async function getDebtsPageData(roleHint?: string): Promise<RoleDataBundle> {
  const context = await getAuthenticatedContext(roleHint);

  if (context.role === "managementCompany") {
    return getManagementRegistryData(context, { includeInvoices: true });
  }

  const bundle = emptyRoleDataBundle(context);
  const invoicesResponse = await apiFetchSafe<ApiListResponse>("/invoices");

  return {
    ...bundle,
    invoices: Array.isArray(invoicesResponse?.items) ? invoicesResponse.items.map(toInvoice) : [],
  };
}

export async function getInvoicesPageData(roleHint?: string): Promise<RoleDataBundle> {
  const context = await getAuthenticatedContext(roleHint);

  if (context.role === "managementCompany") {
    return getManagementRegistryData(context, {
      includeBuildings: true,
      includeApartments: true,
      includeInvoices: true,
    });
  }

  const [residentData, invoicesResponse] = await Promise.all([
    getResidentHomeData(context),
    apiFetchSafe<ApiListResponse>("/invoices"),
  ]);

  return {
    ...residentData,
    invoices: Array.isArray(invoicesResponse?.items) ? invoicesResponse.items.map(toInvoice) : [],
  };
}

export async function getElectricityPageData(roleHint?: string): Promise<RoleDataBundle> {
  return getInvoicesPageData(roleHint);
}

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
    if (!companyId) {
      return {
        role,
        userId,
        profile,
        companyId,
        apartmentId,
        buildings: [],
        apartments: [],
        residents: [],
        invoices: [],
        meterReadings: [],
        documents: [],
        notifications: [],
        managementCompanies: [],
      };
    }

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
    const approvedLiveBuildings = liveBuildings.filter(isApprovedBuilding);
    const liveApartments = sortApartmentsByNumber(
      filterApartmentsByBuildings(
        Array.isArray(apartmentsResponse?.items) ? apartmentsResponse.items : [],
        approvedLiveBuildings,
      ),
    );
    const liveResidents = Array.isArray(residentsResponse?.items) ? residentsResponse.items.map((item) => toResident(item)) : [];
    const supplementalResidents = deriveResidentsFromApartments(liveApartments);

    const mergedResidents = Array.from(
      new Map([...supplementalResidents, ...liveResidents].map((resident) => [resident.id, resident])).values(),
    );
    const liveInvoices = filterInvoicesByActiveObjects(
      Array.isArray(invoicesResponse?.items) ? invoicesResponse.items.map(toInvoice) : [],
      approvedLiveBuildings,
      liveApartments,
    );
    const liveMeterReadings = Array.isArray(meterReadingsResponse?.items)
      ? filterReadingsByActiveObjects(meterReadingsResponse.items.map(toMeterReading), approvedLiveBuildings, liveApartments)
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
  liveApartments.sort(compareApartmentOrder);
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
