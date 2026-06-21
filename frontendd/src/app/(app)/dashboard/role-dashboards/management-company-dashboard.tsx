import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { FiExternalLink } from "react-icons/fi";
import { BuildingReadingsSelector } from "./building-readings-selector";
import type { RoleDataBundle } from "@/shared/lib/domera-api.server";
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

export async function ManagementCompanyDashboard({ data, selectedBuildingId }: { data: RoleDataBundle; selectedBuildingId?: string }) {
  const t = await getTranslations("dashboard.managementCompany");
  const locale = await getLocale();
  const buildingOptions = data.buildings.map((building) => ({
    id: building.id,
    label: building.address && building.address !== "—" ? building.address : building.name,
  }));
  const effectiveBuildingId =
    selectedBuildingId && data.buildings.some((building) => building.id === selectedBuildingId)
      ? selectedBuildingId
      : data.buildings[0]?.id;
  const selectedBuilding = data.buildings.find((building) => building.id === effectiveBuildingId);
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
  const submittedApartmentKeys = new Set(
    data.meterReadings
      .filter((item) => isReadingFromMonth(item, currentMonth, currentYear))
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
  const portfolioSubmissionPeriod = selectedBuilding?.readingConfig?.submissionPeriod;
  const submissionWindow = resolveSubmissionWindow(portfolioSubmissionPeriod, now);
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
              title={t("openReadings")}
              aria-label={t("openReadings")}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-900 transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
              <FiExternalLink className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
