import Link from "next/link";
import { FiExternalLink } from "react-icons/fi";
import type { RoleDataBundle } from "@/shared/lib/domera-api.server";
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

function formatConsumption(value: number) {
  return `${value.toLocaleString("ru-RU", { maximumFractionDigits: 3 })} м³`;
}

function buildConsumptionRows(meters: MeterStatus[]) {
  const rows = [
    { key: "coldmeterwater" as const, label: "Холодная вода" },
    { key: "hotmeterwater" as const, label: "Горячая вода" },
  ];

  return rows
    .map((row) => {
      const total = meters.filter((meter) => meter.meterKey === row.key).reduce((sum, meter) => {
        const consumption = Number(meter.reading?.consumption ?? meter.reading?.trend);
        return Number.isFinite(consumption) ? sum + consumption : sum;
      }, 0);

      return total > 0 ? { ...row, value: formatConsumption(total) } : null;
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

export function ResidentDashboard({ data }: { data: RoleDataBundle }) {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const monthLabel = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(now);
  const meters = buildMeterStatuses(data, month, year);
  const submittedCount = meters.filter((meter) => meter.reading).length;
  const allSubmitted = meters.length > 0 && submittedCount === meters.length;
  const consumptionRows = allSubmitted && hasAnyConsumption(meters) ? buildConsumptionRows(meters) : [];
  const managementCompany = resolveManagementCompany(data);
  const companyContactRows = buildCompanyContactRows(managementCompany);
  const hasCompanyContacts = companyContactRows.some((contact) => contact.fullName || contact.email || contact.phone);
  const hasLinkedApartment = data.apartments.some((apartment) => {
    const item = asRecord(apartment);
    return Boolean(text(item.id, item.apartmentId, item.readableId));
  });

  if (!hasLinkedApartment) {
    return null;
  }

  return (
    <div className="grid w-full max-w-3xl items-start gap-4 md:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium text-slate-500">Мои показания</p>
          <Link
            href={ROUTES.meterReadings}
            aria-label="Мои показания"
            title="Мои показания"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-700 transition hover:bg-slate-100 hover:text-slate-950"
          >
            <FiExternalLink className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        <div className="mt-3 flex items-center justify-between gap-4">
          <h1 className="text-lg font-semibold text-slate-900">{monthLabel}</h1>
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${
              allSubmitted ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
            }`}
          >
            {allSubmitted ? "Сдано" : "Не сдано"}
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
        <p className="text-sm font-medium text-slate-500">Управляющая компания</p>
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
          <p className="mt-3 text-sm text-slate-600">Контакты не указаны</p>
        )}
      </section>
    </div>
  );
}
