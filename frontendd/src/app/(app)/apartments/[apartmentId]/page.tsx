import Link from "next/link";
import { DataTable } from "@/components/data-table";
import { SectionCard } from "@/components/section-card";
import { apiFetch, getRoleDataBundle } from "@/shared/lib/domera-api.server";
import { ROUTES } from "@/shared/lib/routes";
import { ApartmentSelector } from "./apartment-selector";

type UnknownRecord = Record<string, unknown>;

function toText(value: unknown, fallback = "—") {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return fallback;
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
  const { apartmentId } = await params;
  const data = await getRoleDataBundle();
  const normalizedId = decodeURIComponent(apartmentId);

  const baseApartment = data.apartments.find((item) => {
    const candidates = [item.id, item.apartmentId, item.number].map((value) => toText(value, ""));
    return candidates.includes(normalizedId);
  });

  const apartmentOptions = data.apartments.map((item) => {
    const id = toText(item.id, toText(item.apartmentId, toText(item.number, "")));
    const label = `Dzīvoklis № ${toText(item.number, id)} — ${toText(item.address, toText(item.buildingId, "Adrese nav norādīta"))}`;
    return { id, label };
  }).filter((item) => item.id);

  if (!baseApartment) {
    return (
      <div className="space-y-6">
        <SectionCard title="Dzīvokļa informācija" description="Pieprasītais dzīvoklis netika atrasts.">
          <Link
            href={ROUTES.apartments}
            className="inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            Atpakaļ uz dzīvokļiem
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

  const companyId = toText(apartment.companyId, toText(baseApartment.companyId, data.companyId ?? ""));

  let company: UnknownRecord | null = null;
  try {
    if (companyId) {
      company = await apiFetch<UnknownRecord>(`/company/${encodeURIComponent(companyId)}`);
    }
  } catch {
    company = null;
  }

  const apartmentLabel = toText(apartment.number, toText(baseApartment.number, resolvedApartmentId));
  const address = toText(
    apartment.address,
    toText(apartment.street, toText(baseApartment.address, toText(baseApartment.buildingId, "Nav norādīta"))),
  );
  const floor = toText(apartment.floor, toText(apartment.level, "Nav norādīts"));
  const rooms = toText(apartment.rooms, toText(apartment.roomCount, "Nav norādīts"));
  const area = toText(apartment.area, toText(apartment.squareMeters, "Nav norādīts"));
  const owner = toText(apartment.owner, toText(apartment.ownerName, "Nav norādīts"));
  const ownerEmail = toText(apartment.ownerEmail, "Nav norādīts");
  const companyName = toText(company?.name, toText(company?.title, toText(companyId, "Nav norādīts")));
  const companyEmail = toText(company?.email, toText(company?.contactEmail, toText(company?.ownerEmail, "Nav norādīts")));
  const companyPhone = toText(company?.phone, toText(company?.contactPhone, toText(company?.phoneNumber, "Nav norādīts")));

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
          Array.isArray(record.permissions) ? record.permissions.join(", ") : "Iedzīvotājs",
          <span key={`${toText(record.userId, String(index))}-status`} className="text-emerald-700">Aktīvs</span>,
        ];
      })
    : [["—", "—", "—", "—", "—", "—", <span key="empty-tenants">Nav iemītnieku</span>]];

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
    : [["—", "—", "—", <span key="no-inv">Nav rēķinu</span>]];

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
          <SectionCard title={`DZĪVOKLIS № ${apartmentLabel}`}>
            <div className="border-t border-slate-200 pt-5">
              <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Dzīvokļa pamatinformācija</p>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm text-slate-500">Adrese:</p>
                  <p className="text-lg font-medium text-slate-900">{address}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Stāvs:</p>
                  <p className="text-lg font-medium text-slate-900">{floor}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Istabas:</p>
                  <p className="text-lg font-medium text-slate-900">{rooms}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Platība:</p>
                  <p className="text-lg font-medium text-slate-900">{area}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Īpašnieks:</p>
                  <p className="text-lg font-medium text-slate-900">{owner}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Īpašnieka e-pasts:</p>
                  <p className="text-lg font-medium text-slate-900">{ownerEmail}</p>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="APSAIMNIEKOŠANAS UZŅĒMUMS">
            <div className="space-y-3 text-sm text-slate-700">
              <p className="text-xl font-semibold text-slate-900">{companyName}</p>
              <p>E-pasts: {companyEmail}</p>
              <p>Tālrunis: {companyPhone}</p>
            </div>
          </SectionCard>
        </div>

        <SectionCard title="Iemītnieku pārvaldība">
          <div className="mb-6 flex items-center justify-between rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
            <span className="text-base font-semibold text-slate-900">Pievienot īrnieku</span>
            <a
              href={`mailto:?subject=${encodeURIComponent(`Ielūgums dzīvoklim ${apartmentLabel}`)}`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-blue-300 bg-white text-lg font-semibold text-blue-600 transition hover:bg-blue-100"
              aria-label="Pievienot īrnieku"
            >
              +
            </a>
          </div>
          <div className="space-y-4">
            <h3 className="text-2xl font-semibold text-slate-900">Iemītnieki</h3>
            <DataTable
              columns={["VĀRDS", "UZVĀRDS", "E-PASTS", "DATUMS NO", "DATUMS LĪDZ", "VEIDS", "STATUSS"]}
              rows={tenantRows}
            />
          </div>
        </SectionCard>

        <div className="grid gap-5 xl:grid-cols-2">
          <SectionCard title="Rēķini">
            <DataTable
              columns={["ID", "SUMMA", "APMAKSAS TERMIŅŠ", "STATUSS"]}
              rows={invoiceRows}
            />
          </SectionCard>

          <SectionCard title="Skaitītāju rādījumi">
            <DataTable
              columns={["ID", "RĀDĪJUMS", "IESNIEGTS", "PATĒRIŅŠ"]}
              rows={readingRows}
            />
          </SectionCard>
        </div>
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
          <SectionCard title={`MANS DZĪVOKLIS № ${apartmentLabel}`}>
            <div className="border-t border-slate-200 pt-5">
              <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Dzīvokļa informācija</p>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm text-slate-500">Adrese:</p>
                  <p className="text-lg font-medium text-slate-900">{address}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Stāvs:</p>
                  <p className="text-lg font-medium text-slate-900">{floor}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Istabas:</p>
                  <p className="text-lg font-medium text-slate-900">{rooms}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Platība:</p>
                  <p className="text-lg font-medium text-slate-900">{area}</p>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="APSAIMNIEKOŠANAS UZŅĒMUMS">
            <div className="space-y-3 text-sm text-slate-700">
              <p className="text-xl font-semibold text-slate-900">{companyName}</p>
              <p>E-pasts: <a href={`mailto:${companyEmail}`} className="text-blue-600 hover:underline">{companyEmail}</a></p>
              <p>Tālrunis: <a href={`tel:${companyPhone}`} className="text-blue-600 hover:underline">{companyPhone}</a></p>
            </div>
          </SectionCard>
        </div>

        <SectionCard title="Īrnieki">
          <div className="space-y-4">
            <p className="text-sm text-slate-500">Šajā dzīvoklī reģistrētie īrnieki.</p>
            <DataTable
              columns={["VĀRDS", "UZVĀRDS", "E-PASTS", "DATUMS NO", "DATUMS LĪDZ", "VEIDS", "STATUSS"]}
              rows={tenantRows}
            />
          </div>
        </SectionCard>

        <SectionCard title="Rēķini">
          <DataTable
            columns={["ID", "SUMMA", "APMAKSAS TERMIŅŠ", "STATUSS"]}
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
        <SectionCard title={`MANS DZĪVOKLIS № ${apartmentLabel}`}>
          <div className="border-t border-slate-200 pt-5">
            <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Jūsu dzīvoklis</p>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm text-slate-500">Adrese:</p>
                <p className="text-lg font-medium text-slate-900">{address}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Stāvs:</p>
                <p className="text-lg font-medium text-slate-900">{floor}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Istabas:</p>
                <p className="text-lg font-medium text-slate-900">{rooms}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Platība:</p>
                <p className="text-lg font-medium text-slate-900">{area}</p>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="APSAIMNIEKOŠANAS UZŅĒMUMS">
          <div className="space-y-3 text-sm text-slate-700">
            <p className="text-xl font-semibold text-slate-900">{companyName}</p>
            <p>E-pasts: <a href={`mailto:${companyEmail}`} className="text-blue-600 hover:underline">{companyEmail}</a></p>
            <p>Tālrunis: <a href={`tel:${companyPhone}`} className="text-blue-600 hover:underline">{companyPhone}</a></p>
            <p className="pt-2 text-xs text-slate-400">Ja jums ir jautājumi, sazinieties ar apsaimniekošanas uzņēmumu.</p>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Mani rēķini">
        <DataTable
          columns={["ID", "SUMMA", "APMAKSAS TERMIŅŠ", "STATUSS"]}
          rows={invoiceRows}
        />
      </SectionCard>

      <SectionCard title="Skaitītāju rādījumi">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-slate-500">Jūsu iesniegto skaitītāju rādījumu vēsture.</p>
        </div>
        <DataTable
          columns={["ID", "RĀDĪJUMS", "IESNIEGTS", "PATĒRIŅŠ"]}
          rows={readingRows}
        />
      </SectionCard>
    </div>
  );
}
