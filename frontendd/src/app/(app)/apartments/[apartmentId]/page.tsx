import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { DataTable } from "@/components/data-table";
import { SectionCard } from "@/components/section-card";
import { apiFetch, getRoleDataBundle } from "@/shared/lib/domera-api.server";
import { ROUTES } from "@/shared/lib/routes";
import { ApartmentFullInfoDialog } from "./apartment-full-info-dialog";
import { ApartmentSelector } from "./apartment-selector";
import { TenantAccessManager } from "./tenant-access-manager";
import { AuditLogsBlock } from "./audit-logs-block";

type UnknownRecord = Record<string, unknown>;

function toText(value: unknown, fallback = "—") {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return fallback;
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number") {
      return String(value);
    }
  }

  return "—";
}

function toRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as UnknownRecord;
}

function firstArrayString(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.find((item): item is string => typeof item === "string" && item.trim().length > 0)?.trim();
}

function formatPossibleDate(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString().slice(0, 10);
  }

  if (value && typeof value === "object") {
    const record = value as { seconds?: number; _seconds?: number };
    const seconds = record.seconds ?? record._seconds;
    if (typeof seconds === "number") {
      return new Date(seconds * 1000).toISOString().slice(0, 10);
    }
  }

  return "—";
}

function formatDetailValue(value: unknown, fallback = "—"): string {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  if (typeof value === "string") {
    return value.trim() || fallback;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.length
      ? value.map((item) => formatDetailValue(item, fallback)).join(", ")
      : fallback;
  }

  if (typeof value === "object") {
    const possibleDate = formatPossibleDate(value);
    return possibleDate !== "—" ? possibleDate : JSON.stringify(value);
  }

  return String(value);
}

function splitName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? "—",
    lastName: parts.slice(1).join(" ") || "—",
  };
}

export default async function ApartmentDetailsPage({
  params,
}: {
  params: Promise<{ apartmentId: string }>;
}) {
  const t = await getTranslations("apartments");
  const ui = await getTranslations("ui");
  const { apartmentId } = await params;
  const data = await getRoleDataBundle();
  const normalizedId = decodeURIComponent(apartmentId);

  const baseApartment = data.apartments.find((item) => {
    const candidates = [item.id, item.apartmentId, item.number].map((value) => toText(value, ""));
    return candidates.includes(normalizedId);
  });

  const apartmentOptions = data.apartments.map((item) => {
    const id = toText(item.id, toText(item.apartmentId, toText(item.number, "")));
    const label = t("selector.optionLabel", {
      number: toText(item.number, id),
      address: toText(item.address, toText(item.buildingId, t("common.addressNotSpecified"))),
    });
    return { id, label };
  }).filter((item) => item.id);

  if (!baseApartment) {
    return (
      <div className="space-y-6">
        <SectionCard title={t("details.notFoundTitle")} description={t("details.notFoundDescription")}>
          <Link
            href={ROUTES.apartments}
            className="inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            {t("common.backToApartments")}
          </Link>
        </SectionCard>
      </div>
    );
  }

  const resolvedApartmentId = toText(baseApartment.id, toText(baseApartment.apartmentId, normalizedId));

  let apartment: UnknownRecord = baseApartment;
  try {
    if (resolvedApartmentId && resolvedApartmentId !== "—") {
      apartment = await apiFetch<UnknownRecord>(`/apartments/${encodeURIComponent(resolvedApartmentId)}`);
    }
  } catch {
    apartment = baseApartment;
  }

  const buildingId = firstText(
    apartment.buildingId,
    baseApartment.buildingId,
  );

  const relatedBuilding = data.buildings.find((item) => item.id === buildingId);
  const relatedBuildingRecord = toRecord(relatedBuilding as unknown);
  const managedBy = toRecord(relatedBuildingRecord?.managedBy ?? null);

  const companyId = firstText(
    apartment.companyId,
    firstArrayString(apartment.companyIds),
    baseApartment.companyId,
    firstArrayString(baseApartment.companyIds),
    relatedBuildingRecord?.companyId,
    relatedBuilding?.companyId,
    managedBy?.companyId,
    data.companyId,
  );

  let company: UnknownRecord | null = null;
  try {
    if (companyId && companyId !== "—") {
      company = await apiFetch<UnknownRecord>(`/company/${encodeURIComponent(companyId)}`);
    }
  } catch {
    company = null;
  }

  const apartmentLabel = firstText(apartment.number, baseApartment.number, resolvedApartmentId);
  const address = firstText(
    apartment.address,
    apartment.street,
    baseApartment.address,
    baseApartment.street,
    relatedBuilding?.address,
    relatedBuildingRecord?.street,
    relatedBuilding?.name,
    buildingId,
    t("common.addressNotSpecified"),
  );
  const floor = firstText(apartment.floor, apartment.level, baseApartment.floor, baseApartment.level, t("common.notSpecified"));
  const rooms = firstText(
    apartment.rooms,
    apartment.roomCount,
    baseApartment.rooms,
    baseApartment.roomCount,
    t("common.notSpecified"),
  );
  const area = firstText(
    apartment.area,
    apartment.squareMeters,
    apartment.heatingArea,
    apartment.managementArea,
    baseApartment.area,
    baseApartment.squareMeters,
    baseApartment.heatingArea,
    baseApartment.managementArea,
    t("common.notSpecified"),
  );
  const owner = firstText(apartment.owner, apartment.ownerName, baseApartment.owner, baseApartment.ownerName, t("common.notSpecified"));
  const ownerEmail = firstText(apartment.ownerEmail, baseApartment.ownerEmail, t("common.notSpecified"));
  const companyName = firstText(
    company?.companyName,
    company?.name,
    company?.title,
    relatedBuilding?.companyName,
    relatedBuildingRecord?.companyName,
    managedBy?.companyName,
    managedBy?.name,
    relatedBuildingRecord?.name,
    companyId !== "—" ? companyId : undefined,
    t("common.notSpecified"),
  );
  const companyEmail = firstText(
    company?.companyEmail,
    company?.email,
    company?.contactEmail,
    company?.ownerEmail,
    managedBy?.email,
    managedBy?.contactEmail,
    relatedBuildingRecord?.contactEmail,
    t("common.notSpecified"),
  );
  const companyPhone = firstText(
    company?.companyPhone,
    company?.phone,
    company?.contactPhone,
    company?.phoneNumber,
    managedBy?.phone,
    managedBy?.contactPhone,
    relatedBuildingRecord?.contactPhone,
    relatedBuildingRecord?.phoneNumber,
    t("common.notSpecified"),
  );
  const generalInfoRows: [string, string][] = [
    [t("management.dialogs.apartmentInfo.fields.number"), apartmentLabel],
    [t("common.address"), address],
    [t("common.floor"), floor],
    [t("common.rooms"), rooms],
    [t("common.area"), area],
    [t("details.owner"), owner],
    [t("details.ownerEmail"), ownerEmail],
    [t("management.dialogs.apartmentInfo.fields.cadastralNumber"), formatDetailValue(apartment.cadastralNumber ?? baseApartment.cadastralNumber, t("common.notSpecified"))],
    [t("management.dialogs.apartmentInfo.fields.cadastralPart"), formatDetailValue(apartment.cadastralPart ?? baseApartment.cadastralPart, t("common.notSpecified"))],
    [t("management.dialogs.apartmentInfo.fields.commonPropertyShare"), formatDetailValue(apartment.commonPropertyShare ?? baseApartment.commonPropertyShare, t("common.notSpecified"))],
    [t("management.dialogs.apartmentInfo.fields.apartmentType"), formatDetailValue(apartment.apartmentType ?? baseApartment.apartmentType, t("common.notSpecified"))],
    [t("management.dialogs.apartmentInfo.fields.heatingArea"), formatDetailValue(apartment.heatingArea ?? baseApartment.heatingArea, t("common.notSpecified"))],
    [t("management.dialogs.apartmentInfo.fields.managementArea"), formatDetailValue(apartment.managementArea ?? baseApartment.managementArea, t("common.notSpecified"))],
    [t("management.dialogs.apartmentInfo.fields.declaredResidents"), formatDetailValue(apartment.declaredResidents ?? baseApartment.declaredResidents, t("common.notSpecified"))],
    [t("management.dialogs.apartmentInfo.fields.createdAt"), formatPossibleDate(apartment.createdAt ?? baseApartment.createdAt)],
    [t("management.dialogs.apartmentInfo.fields.updatedAt"), formatPossibleDate(apartment.updatedAt ?? baseApartment.updatedAt)],
  ];

  const companyInfoRows: [string, string][] = [
    [t("common.managementCompany"), companyName],
    [t("common.email"), companyEmail],
    [t("common.phone"), companyPhone],
  ];

  const waterReadings = toRecord(apartment.waterReadings ?? baseApartment.waterReadings);
  const meterSections = [
    {
      title: t("management.dialogs.apartmentInfo.coldWaterTitle"),
      value: waterReadings?.coldmeterwater,
    },
    {
      title: t("management.dialogs.apartmentInfo.hotWaterTitle"),
      value: waterReadings?.hotmeterwater,
    },
  ]
    .map((group) => {
      const record = toRecord(group.value);
      if (!record) {
        return null;
      }

      const history = Array.isArray(record.history) ? record.history : [];
      return {
        title: group.title,
        summaryRows: [
          [t("management.dialogs.apartmentInfo.fields.serialNumber"), formatDetailValue(record.serialNumber, t("common.notSpecified"))],
          [t("management.dialogs.apartmentInfo.fields.checkDueDate"), formatDetailValue(record.checkDueDate, t("common.notSpecified"))],
          [t("management.dialogs.apartmentInfo.fields.currentValue"), formatDetailValue(record.currentValue, t("common.notSpecified"))],
          [t("management.dialogs.apartmentInfo.fields.previousValue"), formatDetailValue(record.previousValue, t("common.notSpecified"))],
          [t("management.dialogs.apartmentInfo.fields.lastSubmitted"), formatDetailValue(record.submittedAt, t("common.notSpecified"))],
        ] as [string, string][],
        historyRows: history.length
          ? history.map((item) => {
              const entry = toRecord(item) ?? {};
              return [
                formatDetailValue(entry.month, t("common.notSpecified")),
                formatDetailValue(entry.year, t("common.notSpecified")),
                formatDetailValue(entry.currentValue ?? entry.value, t("common.notSpecified")),
                formatDetailValue(entry.previousValue, t("common.notSpecified")),
                formatDetailValue(entry.consumption, t("common.notSpecified")),
                formatDetailValue(entry.submittedAt, t("common.notSpecified")),
              ];
            })
          : [[
              t("common.notSpecified"),
              t("common.notSpecified"),
              t("common.notSpecified"),
              t("common.notSpecified"),
              t("common.notSpecified"),
              t("common.notSpecified"),
            ]],
      };
    })
    .filter((group): group is NonNullable<typeof group> => Boolean(group));

  const fullInfoDialog = (
    <ApartmentFullInfoDialog
      buttonLabel={t("details.more")}
      title={t("management.dialogs.apartmentInfo.title", { apartment: apartmentLabel })}
      description={t("management.dialogs.apartmentInfo.description")}
      closeLabel={ui("close")}
      generalTitle={t("management.dialogs.apartmentInfo.generalTableTitle")}
      companyTitle={t("common.managementCompany")}
      metersTitle={t("management.dialogs.apartmentInfo.metersTitle")}
      historyTitle={t("management.dialogs.apartmentInfo.historyTitle")}
      fieldColumnLabel={t("management.dialogs.apartmentInfo.tableColumns.field")}
      valueColumnLabel={t("management.dialogs.apartmentInfo.tableColumns.value")}
      historyColumnLabels={[
        t("management.dialogs.apartmentInfo.historyColumns.month"),
        t("management.dialogs.apartmentInfo.historyColumns.year"),
        t("management.dialogs.apartmentInfo.historyColumns.currentValue"),
        t("management.dialogs.apartmentInfo.historyColumns.previousValue"),
        t("management.dialogs.apartmentInfo.historyColumns.consumption"),
        t("management.dialogs.apartmentInfo.historyColumns.submittedAt"),
      ]}
      generalRows={generalInfoRows}
      companyRows={companyInfoRows}
      meterSections={meterSections}
    />
  );

  const tenants = Array.isArray(apartment.tenants) ? apartment.tenants : [];
  const tenantRows = tenants.length
    ? tenants.map((tenant, index) => {
        const record = (tenant ?? {}) as UnknownRecord;
        const name = splitName(toText(record.name, toText(record.email, "—")));
        return [
          name.firstName,
          name.lastName,
          toText(record.email, "—"),
          formatPossibleDate(record.invitedAt ?? record.createdAt),
          toText(record.until, "—"),
          Array.isArray(record.permissions) ? record.permissions.join(", ") : t("details.tenantTypeResident"),
          record.userId ? (
            <span key={`${toText(record.userId, String(index))}-status`} className="text-emerald-700">{t("details.active")}</span>
          ) : (
            <span key={`${toText(record.userId, String(index))}-status`} className="text-amber-600">{t("details.pending")}</span>
          ),
        ];
      })
    : [["—", "—", "—", "—", "—", "—", <span key="empty-tenants">{t("details.noTenants")}</span>]];

  // Filter invoices and meter readings for this apartment
  const apartmentInvoices = data.invoices.filter(
    (inv) => inv.apartment === resolvedApartmentId || inv.apartment === apartmentLabel,
  );
  const invoiceRows = apartmentInvoices.length
    ? apartmentInvoices.map((inv) => [
        inv.id,
        inv.amount,
        inv.dueDate,
        <span
          key={inv.id}
          className={
            inv.status.toLowerCase() === "paid"
              ? "text-emerald-700"
              : inv.status.toLowerCase() === "overdue"
                ? "text-red-600"
                : "text-amber-600"
          }
        >
          {inv.status}
        </span>,
      ])
    : [["—", "—", "—", <span key="no-inv">{t("details.noInvoices")}</span>]];

  const apartmentReadings = data.meterReadings.filter(
    (r) => r.apartment === resolvedApartmentId || r.apartment === apartmentLabel,
  );
  const readingRows = apartmentReadings.length
    ? apartmentReadings.map((r) => [r.id, r.value, r.submittedAt, r.trend])
    : [["—", "—", "—", "—"]];

  // ── MANAGEMENT COMPANY view ──────────────────────────────────────────────
  if (data.role === "managementCompany") {
    return (
      <div className="space-y-6">
        <ApartmentSelector apartments={apartmentOptions} currentId={resolvedApartmentId || normalizedId} />

        <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
          <SectionCard title={t("details.managementTitle", { apartment: apartmentLabel })}>
            <div className="border-t border-slate-200 pt-5">
              <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">{t("details.basicInfo")}</p>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm text-slate-500">{t("common.address")}:</p>
                  <p className="text-lg font-medium text-slate-900">{address}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">{t("common.floor")}:</p>
                  <p className="text-lg font-medium text-slate-900">{floor}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">{t("common.rooms")}:</p>
                  <p className="text-lg font-medium text-slate-900">{rooms}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">{t("common.area")}:</p>
                  <p className="text-lg font-medium text-slate-900">{area}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">{t("details.owner")}:</p>
                  <p className="text-lg font-medium text-slate-900">{owner}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">{t("details.ownerEmail")}:</p>
                  <p className="text-lg font-medium text-slate-900">{ownerEmail}</p>
                </div>
              </div>
              {fullInfoDialog}
            </div>
          </SectionCard>

          <SectionCard title={t("common.managementCompany")}>
            <div className="space-y-3 text-sm text-slate-700">
              <p className="text-xl font-semibold text-slate-900">{companyName}</p>
              <p>{t("common.email")}: {companyEmail}</p>
              <p>{t("common.phone")}: {companyPhone}</p>
            </div>
          </SectionCard>
        </div>

        <SectionCard title="УПРАВЛЕНИЕ ЖИЛЬЦАМИ"> 
          <TenantAccessManager 
            apartmentId={resolvedApartmentId} 
            apartmentLabel={apartmentLabel}
            companyEmail={companyEmail}
            ownerData={{
              email: ownerEmail,
              userId: typeof apartment.ownerId === "string" ? apartment.ownerId : undefined,
              activated: Boolean(apartment.ownerActivated),
              invitedAt: formatPossibleDate(apartment.ownerInvitedAt ?? baseApartment.ownerInvitedAt),
            }}
            inviteHistory={Array.isArray(apartment.ownerInviteHistory) ? apartment.ownerInviteHistory : []}
            tenants={tenants}
            tenantRows={tenantRows}
            tenantColumns={[
              t("details.columns.firstName"),
              t("details.columns.lastName"),
              t("details.columns.email"),
              t("details.columns.fromDate"),
              t("details.columns.toDate"),
              t("details.columns.type"),
              t("details.columns.status"),
            ]}
            tenantsTitle={t("details.tenants")}
          />
        </SectionCard>

        <div className="grid gap-5 xl:grid-cols-2">
          <SectionCard title={t("details.invoices")}>
            <DataTable
              columns={[
                t("details.invoiceColumns.id"),
                t("details.invoiceColumns.amount"),
                t("details.invoiceColumns.dueDate"),
                t("details.invoiceColumns.status"),
              ]}
              rows={invoiceRows}
            />
          </SectionCard>

          <SectionCard title={t("details.meterReadings")}>
            <DataTable
              columns={[
                t("details.meterColumns.id"),
                t("details.meterColumns.value"),
                t("details.meterColumns.submitted"),
                t("details.meterColumns.consumption"),
              ]}
              rows={readingRows}
            />
          </SectionCard>
        </div>

        <SectionCard title={t("details.auditLogs")}>
          <AuditLogsBlock apartmentId={resolvedApartmentId} />
        </SectionCard>
      </div>
    );
  }

  // ── LANDLORD view ────────────────────────────────────────────────────────
  if (data.role === "landlord") {
    return (
      <div className="space-y-6">
        {apartmentOptions.length > 1 && (
          <ApartmentSelector apartments={apartmentOptions} currentId={resolvedApartmentId || normalizedId} />
        )}

        <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
          <SectionCard title={t("details.landlordTitle", { apartment: apartmentLabel })}>
            <div className="border-t border-slate-200 pt-5">
              <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">{t("details.apartmentInfo")}</p>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm text-slate-500">{t("common.address")}:</p>
                  <p className="text-lg font-medium text-slate-900">{address}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">{t("common.floor")}:</p>
                  <p className="text-lg font-medium text-slate-900">{floor}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">{t("common.rooms")}:</p>
                  <p className="text-lg font-medium text-slate-900">{rooms}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">{t("common.area")}:</p>
                  <p className="text-lg font-medium text-slate-900">{area}</p>
                </div>
              </div>
              {fullInfoDialog}
            </div>
          </SectionCard>

          <SectionCard title={t("common.managementCompany")}>
            <div className="space-y-3 text-sm text-slate-700">
              <p className="text-xl font-semibold text-slate-900">{companyName}</p>
              <p>{t("common.email")}: <a href={`mailto:${companyEmail}`} className="text-blue-600 hover:underline">{companyEmail}</a></p>
              <p>{t("common.phone")}: <a href={`tel:${companyPhone}`} className="text-blue-600 hover:underline">{companyPhone}</a></p>
            </div>
          </SectionCard>
        </div>

        <SectionCard title={t("details.tenants")}> 
          <div className="space-y-4">
            <TenantAccessManager 
              apartmentId={resolvedApartmentId} 
              apartmentLabel={apartmentLabel}
              tenants={tenants}
              tenantRows={tenantRows}
              tenantColumns={[
                t("details.columns.firstName"),
                t("details.columns.lastName"),
                t("details.columns.email"),
                t("details.columns.fromDate"),
                t("details.columns.toDate"),
                t("details.columns.type"),
                t("details.columns.status"),
              ]}
              tenantsTitle={t("details.tenants")}
            />
            <p className="text-sm text-slate-500">{t("details.landlordTenantDescription")}</p>
          </div>
        </SectionCard>

        <SectionCard title={t("details.invoices")}>
          <DataTable
            columns={[
              t("details.invoiceColumns.id"),
              t("details.invoiceColumns.amount"),
              t("details.invoiceColumns.dueDate"),
              t("details.invoiceColumns.status"),
            ]}
            rows={invoiceRows}
          />
        </SectionCard>
      </div>
    );
  }

  // ── RESIDENT view ────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
        <SectionCard title={t("details.residentTitle", { apartment: apartmentLabel })}>
          <div className="border-t border-slate-200 pt-5">
            <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">{t("details.yourApartment")}</p>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm text-slate-500">{t("common.address")}:</p>
                <p className="text-lg font-medium text-slate-900">{address}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">{t("common.floor")}:</p>
                <p className="text-lg font-medium text-slate-900">{floor}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">{t("common.rooms")}:</p>
                <p className="text-lg font-medium text-slate-900">{rooms}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">{t("common.area")}:</p>
                <p className="text-lg font-medium text-slate-900">{area}</p>
              </div>
            </div>
            {fullInfoDialog}
          </div>
        </SectionCard>

        <SectionCard title={t("common.managementCompany")}>
          <div className="space-y-3 text-sm text-slate-700">
            <p className="text-xl font-semibold text-slate-900">{companyName}</p>
            <p>{t("common.email")}: <a href={`mailto:${companyEmail}`} className="text-blue-600 hover:underline">{companyEmail}</a></p>
            <p>{t("common.phone")}: <a href={`tel:${companyPhone}`} className="text-blue-600 hover:underline">{companyPhone}</a></p>
            <p className="pt-2 text-xs text-slate-400">{t("details.companyQuestions")}</p>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
