import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { MiniBadge, StatCard, SurfaceCard } from "./shared";
import { ROUTES } from "@/shared/lib/routes";
import type { RoleDataBundle } from "@/shared/lib/domera-api.server";

function getMonthKey(value: string | undefined) {
  if (!value || value === "—" || value === "РІР‚вЂќ") {
    return null;
  }

  const isoMonth = /^(\d{4})-(\d{2})/.exec(value);
  if (isoMonth) {
    return `${isoMonth[1]}-${isoMonth[2]}`;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getCurrentMonthInfo(locale: string) {
  const date = new Date();
  const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  const label = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(date);

  return {
    key,
    label: label.replace(/^./, (value) => value.toUpperCase()),
  };
}

function valueToText(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function getApartmentKeys(apartment: Record<string, unknown>) {
  return [
    valueToText(apartment.id),
    valueToText(apartment.apartmentId),
    valueToText(apartment.number),
    valueToText(apartment.apartmentNumber),
  ].filter(Boolean);
}

function getApartmentTitle(apartment: Record<string, unknown>, fallbackAddress: string) {
  const number = valueToText(apartment.number) || valueToText(apartment.apartmentNumber) || valueToText(apartment.id) || "—";
  const address =
    valueToText(apartment.address) ||
    valueToText(apartment.buildingName) ||
    valueToText(apartment.buildingId) ||
    fallbackAddress;

  return `№ ${number} · ${address}`;
}

function pluralApartmentKey(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return "apartmentOne";
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return "apartmentFew";
  }

  return "apartmentMany";
}

export async function LandlordDashboard({ data }: { data: RoleDataBundle }) {
  const t = await getTranslations("dashboard.landlord");
  const locale = await getLocale();
  const occupiedUnits = data.apartments.filter((item) => {
    const tenants = Array.isArray(item.tenants) ? item.tenants.length : 0;
    return Boolean(item.residentId) || tenants > 0;
  }).length;
  const openIssues = data.invoices.filter((item) => item.status !== "Paid").length;

  const currentMonth = getCurrentMonthInfo(locale);
  const currentMonthApartmentKeys = new Set(
    data.meterReadings
      .filter((item) => getMonthKey(item.submittedAt) === currentMonth.key)
      .map((item) => valueToText(item.apartment))
      .filter(Boolean),
  );
  const apartmentsWithoutCurrentReadings = data.apartments.filter((apartment) => {
    const keys = getApartmentKeys(apartment);
    return keys.length === 0 || !keys.some((key) => currentMonthApartmentKeys.has(key));
  });
  const readingsToSubmit = apartmentsWithoutCurrentReadings.length;
  const needsMeterReading = data.apartments.length > 0 && readingsToSubmit > 0;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-emerald-200 bg-emerald-50/80 p-5 shadow-sm">
        <p className="text-sm font-medium text-emerald-700">{t("viewLabel")}</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">{t("portfolioTitle")}</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          {t("portfolioDescription")}
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("ownedUnits")}
          value={String(data.apartments.length || 0)}
          hint={t("acrossBuildings", { count: data.buildings.length })}
          accent="green"
        />
        <StatCard
          label={t("occupied")}
          value={`${occupiedUnits} / ${data.apartments.length || 0}`}
          hint={t("occupiedHint")}
          accent="blue"
        />
        <StatCard
          label={t("expectedIncome")}
          value={new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(
            data.invoices.reduce((total, item) => total + Number(item.amount.replace(/[^\d.-]/g, "") || 0), 0),
          )}
          hint={t("invoiceSumHint")}
          accent="orange"
        />
        <StatCard label={t("openIssues")} value={String(openIssues)} hint={t("openIssuesHint")} accent="red" />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <SurfaceCard title={t("apartmentStatus")}>
          <div className="space-y-3 text-sm text-slate-600">
            {(data.apartments.length ? data.apartments : [{ id: "—", number: "—", address: t("noApartmentsLinked") }])
              .slice(0, 3)
              .map((item) => {
                const title = getApartmentTitle(item, t("unknownBuilding"));
                const tenants = Array.isArray(item.tenants) ? item.tenants.length : 0;
                const status = item.residentId || tenants > 0 ? t("statusOccupied") : t("statusVacant");

                return (
                  <div key={title} className="flex items-center justify-between rounded-2xl border border-slate-100 p-3">
                    <span className="font-medium text-slate-800">{title}</span>
                    <MiniBadge>{status}</MiniBadge>
                  </div>
                );
              })}
          </div>
        </SurfaceCard>

        <SurfaceCard title={t("tenantActivity")}>
          <div className="space-y-3">
            {[
              [t("meterReadingsSubmitted"), t("entries", { count: data.meterReadings.length })],
              [t("unreadNotifications"), t("items", { count: data.notifications.length })],
              [
                t("upcomingPayments"),
                t("openInvoicesCount", { count: data.invoices.filter((item) => item.status !== "Paid").length }),
              ],
            ].map(([title, meta]) => (
              <div key={title} className="rounded-2xl border border-slate-100 p-3">
                <p className="font-medium text-slate-900">{title}</p>
                <p className="mt-1 text-sm text-slate-500">{meta}</p>
              </div>
            ))}
          </div>
        </SurfaceCard>
      </section>

      <SurfaceCard title={t("readingsTitle")}>
        {data.apartments.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="font-medium text-slate-900">{t("noApartmentsTitle")}</p>
            <p className="mt-1 text-sm text-slate-500">
              {t("noApartmentsDescription")}
            </p>
          </div>
        ) : needsMeterReading ? (
          <div className="flex flex-col gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-amber-950">{t("needReadingsTitle")}</p>
              <p className="mt-1 text-sm text-amber-800">
                {t("needReadingsDescription", {
                  month: currentMonth.label,
                  count: readingsToSubmit,
                  apartmentWord: t(pluralApartmentKey(readingsToSubmit)),
                })}
              </p>
            </div>
            <Link
              href={ROUTES.meterReadings}
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              {t("submitReadings")}
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="font-semibold text-emerald-950">{t("submittedTitle")}</p>
            <p className="text-sm text-emerald-700">{t("submittedDescription", { month: currentMonth.label })}</p>
          </div>
        )}
      </SurfaceCard>
    </div>
  );
}
