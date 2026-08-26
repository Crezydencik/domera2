import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { FiExternalLink } from "react-icons/fi";
import type { RoleDataBundle } from "@/shared/server/auth-context";
import type { MeterReading } from "@/shared/lib/data";
import { ROUTES } from "@/shared/lib/routes";

type MeterKind = "coldmeterwater" | "hotmeterwater";

type MeterStatus = {
  id: string;
  apartmentId: string;
  meterKey: MeterKind;
  serialNumber?: string;
  reading?: MeterReading;
};

type CompanyContactRow = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  position: string;
};

type LinkedApartmentRow = {
  id: string;
  label: string;
  building: string;
  summary: string;
};

const meterTypes: MeterKind[] = ["coldmeterwater", "hotmeterwater"];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function text(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }

  return "";
}

function meterGroups(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
  }

  const record = asRecord(value);
  return Object.keys(record).length ? [record] : [];
}

function readingMatchesMeter(reading: MeterReading, apartmentId: string, meterKey: MeterKind, serialNumber?: string) {
  if (reading.meterKey !== meterKey) return false;
  if (reading.apartmentId && reading.apartmentId !== apartmentId) return false;
  if (serialNumber && reading.serialNumber && reading.serialNumber !== serialNumber) return false;

  return true;
}

function buildMeterStatuses(data: RoleDataBundle, month: number, year: number): MeterStatus[] {
  const readingsForMonth = data.meterReadings.filter((reading) => reading.month === month && reading.year === year);
  const statuses: MeterStatus[] = [];

  for (const apartment of data.apartments) {
    const item = asRecord(apartment);
    const apartmentId = text(item.id, item.apartmentId);
    if (!apartmentId) continue;

    const waterReadings = asRecord(item.waterReadings);

    for (const meterType of meterTypes) {
      const groups = meterGroups(waterReadings[meterType]);

      groups.forEach((group, index) => {
        const serialNumber = text(group.serialNumber);
        const meterId = text(group.meterId, group.id, serialNumber, `${meterType}-${index}`);
        const reading = readingsForMonth.find((candidate) =>
          readingMatchesMeter(candidate, apartmentId, meterType, serialNumber || undefined),
        );

        statuses.push({
          id: `${apartmentId}-${meterType}-${meterId}`,
          apartmentId,
          meterKey: meterType,
          serialNumber: serialNumber || undefined,
          reading,
        });
      });
    }
  }

  if (statuses.length) return statuses;

  return readingsForMonth.map((reading) => {
    const apartmentId = reading.apartmentId ?? "";
    const meterKey = reading.meterKey === "hotmeterwater" ? "hotmeterwater" : "coldmeterwater";

    return {
      id: reading.id,
      apartmentId,
      meterKey,
      serialNumber: reading.serialNumber,
      reading,
    };
  });
}

function formatConsumption(value: number, locale: string) {
  return `${value.toLocaleString(locale, { maximumFractionDigits: 3 })} m³`;
}

function buildConsumptionRows(
  meters: MeterStatus[],
  labels: Record<MeterKind, string>,
  locale: string,
) {
  const rows = [
    { key: "coldmeterwater" as const, label: labels.coldmeterwater },
    { key: "hotmeterwater" as const, label: labels.hotmeterwater },
  ];

  return rows
    .map((row) => {
      const total = meters.filter((meter) => meter.meterKey === row.key).reduce((sum, meter) => {
        const consumption = Number(meter.reading?.consumption ?? meter.reading?.trend);
        return Number.isFinite(consumption) ? sum + consumption : sum;
      }, 0);

      return total > 0 ? { ...row, value: formatConsumption(total, locale) } : null;
    })
    .filter((row): row is { key: MeterKind; label: string; value: string } => Boolean(row));
}

function hasAnyConsumption(meters: MeterStatus[]) {
  return meters.some((meter) => {
    const consumption = Number(meter.reading?.consumption ?? meter.reading?.trend);
    return Number.isFinite(consumption) && consumption > 0;
  });
}

function resolveManagementCompany(data: RoleDataBundle) {
  const company = asRecord(data.managementCompanies[0]);
  const building = data.buildings[0];
  const managedBy = asRecord(building?.managedBy);
  const name = text(
    company.companyName,
    company.name,
    managedBy.companyName,
    managedBy.name,
    building?.companyName,
  );
  const email = text(company.companyEmail, company.email, company.contactEmail, managedBy.companyEmail, managedBy.email);
  const phone = text(company.companyPhone, company.phone, company.contactPhone, managedBy.companyPhone, managedBy.phone);

  return { company, name, email, phone };
}

function buildCompanyContactRows(managementCompany: ReturnType<typeof resolveManagementCompany>): CompanyContactRow[] {
  const companyContactRows = Array.isArray(managementCompany.company.staffContacts)
    ? managementCompany.company.staffContacts
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
        .filter((item) => item.createAccount === false)
        .map((item, index) => ({
          id: text(item.id, item.email, item.fullName) || `company-contact-${index}`,
          fullName: text(item.fullName, item.name, item.firstName, item.email),
          email: text(item.email),
          phone: text(item.phone),
          position: text(item.position, item.jobTitle, item.comment),
        }))
        .filter((item) => item.fullName || item.email || item.phone)
    : [];

  return companyContactRows;
}

function isTechnicalLabel(value: string) {
  const normalized = value.trim();
  if (!normalized) return true;
  if (/^\d+$/.test(normalized)) return true;
  if (/^[a-z0-9]{12,}$/i.test(normalized.replace(/[-_]/g, ""))) return true;
  return false;
}

function buildLinkedApartments(data: RoleDataBundle): LinkedApartmentRow[] {
  return data.apartments
    .map((apartment, index) => {
      const item = asRecord(apartment);
      const id = text(item.id, item.apartmentId, item.readableId, `apartment-${index}`);
      const buildingLabel = text(item.buildingAddress, item.address, item.buildingName);
      const safeBuildingLabel = isTechnicalLabel(buildingLabel) ? "" : buildingLabel;
      const label = safeBuildingLabel;
      const summary = "";

      return {
        id,
        label,
        building: safeBuildingLabel,
        summary,
      };
    })
    .sort((left, right) => {
      const leftLabel = left.label || left.id;
      const rightLabel = right.label || right.id;
      return leftLabel.localeCompare(rightLabel, undefined, { numeric: true, sensitivity: "base" });
    });
}

export async function ResidentDashboard({ data }: { data: RoleDataBundle }) {
  const locale = await getLocale();
  const t = await getTranslations("dashboard.resident");
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const monthLabel = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(now);
  const meters = buildMeterStatuses(data, month, year);
  const submittedCount = meters.filter((meter) => meter.reading).length;
  const allSubmitted = meters.length > 0 && submittedCount === meters.length;
  const consumptionRows = allSubmitted && hasAnyConsumption(meters)
    ? buildConsumptionRows(
        meters,
        { coldmeterwater: t("coldWater"), hotmeterwater: t("hotWater") },
        locale,
      )
    : [];
  const managementCompany = resolveManagementCompany(data);
  const companyContactRows = buildCompanyContactRows(managementCompany);
  const hasCompanyContacts = companyContactRows.some((contact) => contact.fullName || contact.email || contact.phone);
  const linkedApartments = buildLinkedApartments(data).map((apartment, index) => ({
    ...apartment,
    label: apartment.label || `${t("linkedApartmentFallback")} ${index + 1}`,
    summary: apartment.summary,
  }));
  const hasLinkedApartment = linkedApartments.length > 0;

  if (!hasLinkedApartment) {
    return null;
  }

  return (
    <div className="grid w-full max-w-3xl items-start gap-4 md:grid-cols-2">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:col-span-2">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-slate-500">{t("linkedApartments")}</p>
              <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-sky-50 px-2.5 text-xs font-semibold text-sky-700 ring-1 ring-sky-100">
                {linkedApartments.length}
              </span>
            </div>
            <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
              {linkedApartments.length === 1 ? "1" : linkedApartments.length}{" "}
              {linkedApartments.length === 1 ? t("linkedApartmentSingle") : t("linkedApartmentMany")}
            </p>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{t("linkedApartmentsHint")}</p>
          </div>
          <Link
            href={ROUTES.apartments}
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            {t("openApartments")}
          </Link>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {linkedApartments.map((apartment) => (
            <Link
              key={apartment.id}
              href={`${ROUTES.apartments}/${encodeURIComponent(apartment.id)}`}
              className="group flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700 transition hover:border-slate-300 hover:bg-white"
            >
              <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-sky-500" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-slate-900">{apartment.label}</span>
                <span className="mt-0.5 block truncate text-xs text-slate-500">
                  {apartment.summary || apartment.building || t("linkedApartmentFallback")}
                </span>
              </span>
              <FiExternalLink className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-slate-500" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium text-slate-500">{t("myReadings")}</p>
          <Link
            href={ROUTES.meterReadings}
            aria-label={t("myReadings")}
            title={t("submitReadings")}
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950"
          >
            <span>{t("submitReadings")}</span>
            <FiExternalLink className="ml-2 h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        <div className="mt-3 flex items-center justify-between gap-4">
          <h1 className="text-lg font-semibold text-slate-900">{monthLabel}</h1>
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${
              allSubmitted ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
            }`}
          >
            {allSubmitted ? t("submitted") : t("notSubmitted")}
          </span>
        </div>
        {consumptionRows.length ? (
          <div className="mt-3 space-y-1 text-sm text-slate-600">
            {consumptionRows.map((row) => (
              <p key={row.key}>
                {row.label}: {row.value}
              </p>
            ))}
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-medium text-slate-500">{t("managementCompany")}</p>
        {hasCompanyContacts ? (
          <div className="mt-3 space-y-3 text-sm text-slate-600">
            {companyContactRows.map((contact, index) => (
              <div key={contact.id} className={index > 0 ? "border-t border-slate-100 pt-3" : undefined}>
                {contact.fullName || managementCompany.name ? (
                  <h2 className="text-lg font-semibold text-slate-900">
                    {contact.fullName || managementCompany.name}
                    {contact.position ? <span className="font-normal text-slate-700"> - {contact.position}</span> : null}
                  </h2>
                ) : null}
                {contact.email ? (
                  <a className="mt-3 block hover:text-blue-700" href={`mailto:${contact.email}`}>
                    {contact.email}
                  </a>
                ) : null}
                {contact.phone ? (
                  <a className="mt-1 block hover:text-blue-700" href={`tel:${contact.phone}`}>
                    {contact.phone}
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-600">{t("contactsMissing")}</p>
        )}
      </section>
    </div>
  );
}
