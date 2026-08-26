import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { FiCheckCircle, FiExternalLink, FiPlus } from "react-icons/fi";
import { BuildingReadingsSelector } from "./building-readings-selector";
import type { RoleDataBundle } from "@/shared/server/auth-context";
import { isApprovedBuilding } from "@/shared/lib/buildings";
import { ROUTES } from "@/shared/lib/routes";

type SubmissionPeriod = NonNullable<RoleDataBundle["buildings"][number]["readingConfig"]>["submissionPeriod"];

function getReadingApartmentKey(reading: RoleDataBundle["meterReadings"][number]): string | undefined {
  return reading.apartmentId || reading.apartment;
}

function getApartmentId(apartment: RoleDataBundle["apartments"][number]): string | undefined {
  const id = apartment.id ?? apartment.apartmentId ?? apartment.readableId;
  return typeof id === "string" && id.trim() ? id.trim() : undefined;
}

function getApartmentBuildingId(apartment: RoleDataBundle["apartments"][number]): string | undefined {
  const buildingId = apartment.buildingId ?? apartment.building;
  return typeof buildingId === "string" && buildingId.trim() ? buildingId.trim() : undefined;
}

function isReadingFromMonth(reading: RoleDataBundle["meterReadings"][number], month: number, year: number): boolean {
  if (reading.month === month && reading.year === year) {
    return true;
  }

  const submittedAt = new Date(reading.submittedAt);

  return !Number.isNaN(submittedAt.getTime()) && submittedAt.getMonth() + 1 === month && submittedAt.getFullYear() === year;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function getReadingSubmittedDate(reading: RoleDataBundle["meterReadings"][number]): Date | null {
  const submittedAt = new Date(reading.submittedAt);
  return Number.isNaN(submittedAt.getTime()) ? null : submittedAt;
}

function isReadingInSubmissionWindow(reading: RoleDataBundle["meterReadings"][number], window: { start: Date; end: Date }) {
  const submittedAt = getReadingSubmittedDate(reading);
  if (!submittedAt) return false;

  return submittedAt >= startOfDay(window.start) && submittedAt <= endOfDay(window.end);
}

function formatMonthLabel(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(date);
}

function formatShortDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit" }).format(date);
}

function resolveSubmissionWindow(period: SubmissionPeriod | undefined, fallbackDate: Date) {
  const year = fallbackDate.getFullYear();
  const month = fallbackDate.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const defaultStart = new Date(year, month, 1);
  const defaultEnd = new Date(year, month, lastDay);

  if (!period?.startDate || !period.endDate) {
    return { start: defaultStart, end: defaultEnd };
  }

  const savedStart = new Date(period.startDate);
  const savedEnd = new Date(period.endDate);

  if (Number.isNaN(savedStart.getTime()) || Number.isNaN(savedEnd.getTime())) {
    return { start: defaultStart, end: defaultEnd };
  }

  if (!period.monthly) {
    return { start: savedStart, end: savedEnd };
  }

  const clampDay = (day: number) => Math.min(Math.max(day, 1), lastDay);

  return {
    start: new Date(year, month, clampDay(savedStart.getDate())),
    end: new Date(year, month, clampDay(savedEnd.getDate())),
  };
}

type EmptyPortfolioStateProps = {
  title: string;
  description: string;
  features: string[];
  actionLabel: string;
};

function EmptyPortfolioState({ title, description, features, actionLabel }: EmptyPortfolioStateProps) {
  return (
    <div className="flex min-h-[calc(100vh-11rem)] items-center justify-center px-2 py-10">
      <section className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm shadow-slate-950/[0.04]">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-sky-50 text-sky-700 ring-1 ring-sky-100">
          <FiPlus className="h-5 w-5" aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-xl font-semibold text-slate-950">{title}</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">{description}</p>

        <div className="mx-auto mt-5 grid max-w-xl gap-2 text-left sm:grid-cols-2">
          {features.map((feature) => (
            <div key={feature} className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
              <FiCheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
              <span className="text-sm leading-5 text-slate-700">{feature}</span>
            </div>
          ))}
        </div>

        <Link
          href={ROUTES.buildings}
          className="mt-6 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-200"
        >
          <FiPlus className="h-4 w-4" aria-hidden="true" />
          {actionLabel}
        </Link>
      </section>
    </div>
  );
}

export async function ManagementCompanyDashboard({ data, selectedBuildingId }: { data: RoleDataBundle; selectedBuildingId?: string }) {
  const t = await getTranslations("dashboard.managementCompany");
  const locale = await getLocale();
  const approvedBuildings = data.buildings.filter(isApprovedBuilding);

  if (approvedBuildings.length === 0) {
    return (
      <EmptyPortfolioState
        title={t("emptyPortfolio.title")}
        description={t("emptyPortfolio.description")}
        features={[
          t("emptyPortfolio.features.registry"),
          t("emptyPortfolio.features.people"),
          t("emptyPortfolio.features.billing"),
          t("emptyPortfolio.features.documents"),
        ]}
        actionLabel={t("emptyPortfolio.action")}
      />
    );
  }

  const buildingOptions = approvedBuildings.map((building) => ({
    id: building.id,
    label: building.address && building.address !== "—" ? building.address : building.name,
  }));
  const effectiveBuildingId =
    selectedBuildingId && approvedBuildings.some((building) => building.id === selectedBuildingId)
      ? selectedBuildingId
      : approvedBuildings[0]?.id;
  const selectedBuilding = approvedBuildings.find((building) => building.id === effectiveBuildingId);
  const apartmentIdsByBuilding = new Map<string, string>();

  data.apartments.forEach((apartment) => {
    const apartmentId = getApartmentId(apartment);
    const buildingId = getApartmentBuildingId(apartment);
    if (apartmentId && buildingId) {
      apartmentIdsByBuilding.set(apartmentId, buildingId);
    }
  });

  const totalApartmentCount = data.apartments.length;
  const selectedBuildingApartments = effectiveBuildingId
    ? data.apartments.filter((apartment) => getApartmentBuildingId(apartment) === effectiveBuildingId)
    : data.apartments;
  const selectedApartmentCount = selectedBuildingApartments.length;
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const portfolioSubmissionPeriod = selectedBuilding?.readingConfig?.submissionPeriod;
  const submissionWindow = resolveSubmissionWindow(portfolioSubmissionPeriod, now);
  const submissionWindowHasStarted = startOfDay(now) >= startOfDay(submissionWindow.start);
  const submittedApartmentKeys = new Set(
    (submissionWindowHasStarted ? data.meterReadings : [])
      .filter((item) => isReadingFromMonth(item, currentMonth, currentYear))
      .filter((item) => isReadingInSubmissionWindow(item, submissionWindow))
      .filter((item) => {
        if (!effectiveBuildingId) return true;
        if (item.buildingId) return item.buildingId === effectiveBuildingId;
        const apartmentKey = getReadingApartmentKey(item);
        return apartmentKey ? apartmentIdsByBuilding.get(apartmentKey) === effectiveBuildingId : false;
      })
      .map(getReadingApartmentKey)
      .filter((value): value is string => Boolean(value)),
  );
  const submittedApartmentCount = submittedApartmentKeys.size;
  const readingCoverage = selectedApartmentCount > 0 ? Math.round((submittedApartmentCount / selectedApartmentCount) * 100) : 0;
  const readingMonthLabel = formatMonthLabel(now, locale);
  const submissionWindowLabel = `${formatShortDate(submissionWindow.start, locale)} - ${formatShortDate(submissionWindow.end, locale)}`;

  return (
    <div>
      <section className="grid max-w-4xl gap-4 md:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-slate-500">{t("managedObjects")}</p>
              <div className="mt-4 space-y-3">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-sm font-medium text-slate-600">{t("buildings")}</p>
                  <p className="text-3xl font-semibold text-slate-900">{data.buildings.length}</p>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-sm font-medium text-slate-600">{t("apartments")}</p>
                  <p className="text-3xl font-semibold text-slate-900">{totalApartmentCount}</p>
                </div>
              </div>
              <p className="mt-4 text-sm text-slate-500">{t("totalObjects")}</p>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
              <span className="h-2.5 w-2.5 rounded-full bg-orange-600" />
            </div>
          </div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm text-slate-500">{t("meterReadings")}</p>
              {buildingOptions.length > 1 && effectiveBuildingId ? (
                <BuildingReadingsSelector buildings={buildingOptions} selectedBuildingId={effectiveBuildingId} />
              ) : null}
              <p className="mt-3 text-3xl font-semibold text-slate-900">{submittedApartmentCount} / {selectedApartmentCount}</p>
              <p className="mt-2 text-sm text-slate-500">{t("submittedThisMonth", { coverage: readingCoverage })}</p>
              <div className="mt-3 space-y-1 text-sm text-slate-600">
                <p>{t("month", { month: readingMonthLabel })}</p>
                <p>{t("submissionPeriod", { period: submissionWindowLabel })}</p>
              </div>
            </div>
            <Link
              href={ROUTES.meterReadings}
              title={t("submitReadings")}
              aria-label={t("submitReadings")}
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
              <span>{t("submitReadings")}</span>
              <FiExternalLink className="ml-2 h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
