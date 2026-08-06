"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { apiFetch } from "@/shared/api/client";
import { notifyMeterReadingsChanged, notifyOwnerMeterReadingStatus } from "@/shared/hooks/use-app-notifications";
import { useNotifications } from "@/shared/hooks/use-notifications";
import {
  ResidentOwnerSubmitForm,
  residentOwnerMeterValueKey,
  type ResidentOwnerApartmentOption,
  type ResidentOwnerMeterOption,
  type SubmissionPeriodValue,
} from "./_resident-owner-submit-form";

type UnknownRecord = Record<string, unknown>;

interface ReadingRow {
  id: string;
  apartmentId: string;
  apartment: string;
  meterKey: string;
  meterLabel: string;
  previousValue: number | string;
  currentValue: number;
  consumption: number;
  submittedAt: string;
  submittedAtTime: number;
  month?: number;
  year?: number;
  historyVisible: boolean;
}

type PeriodGroup = {
  key: string;
  date: string;
  apartment: string;
  items: ReadingRow[];
};

type MonthGroup = {
  key: string;
  label: string;
  count: number;
  periods: PeriodGroup[];
};

type BuildingOption = {
  id: string;
  submissionPeriod?: SubmissionPeriodValue | null;
  waterSubmissionPeriod?: SubmissionPeriodValue | null;
  electricitySubmissionPeriod?: SubmissionPeriodValue | null;
  waterEnabled?: boolean;
  hotWaterMetersPerResident?: number;
  coldWaterMetersPerResident?: number;
  electricityEnabled?: boolean;
  electricityMeterDigits?: number;
  electricityUserSetsDigits?: boolean;
  electricityAllowMultipleMonthlySubmissions?: boolean;
  electricityFixedPriceEnabled?: boolean;
  electricityPricePerKwh?: number;
};

type MeterLabels = Record<ResidentOwnerMeterOption["key"], string>;
type UtilityTab = "water" | "electricity";

const DEFAULT_METER_LABELS: MeterLabels = {
  coldmeterwater: "Cold water",
  hotmeterwater: "Hot water",
  electricitymeter: "Electricity",
};

function isWaterMeterKey(key: string) {
  return key === "coldmeterwater" || key === "hotmeterwater";
}

function isElectricityMeterKey(key: string) {
  return key === "electricitymeter";
}

function meterMatchesTab(meter: ResidentOwnerMeterOption, tab: UtilityTab) {
  return tab === "water" ? isWaterMeterKey(meter.key) : isElectricityMeterKey(meter.key);
}

function readingMatchesTab(reading: ReadingRow, tab: UtilityTab) {
  return tab === "water" ? isWaterMeterKey(reading.meterKey) : isElectricityMeterKey(reading.meterKey);
}

function allowedMeterKeysForBuilding(building: BuildingOption | undefined) {
  const keys = new Set<ResidentOwnerMeterOption["key"]>();
  if (building?.waterEnabled) {
    keys.add("coldmeterwater");
    keys.add("hotmeterwater");
  }
  if (building?.electricityEnabled) {
    keys.add("electricitymeter");
  }
  return keys;
}

function text(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function consumptionValue(currentValue: number, previousValue: number) {
  return Number(Math.max(0, currentValue - previousValue).toFixed(3));
}

function formatConsumption(value: unknown) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed.toFixed(3) : "-";
}

function readingConsumption(reading: ReadingRow) {
  const previousValue = numberValue(reading.previousValue, Number.NaN);
  return Number.isFinite(previousValue)
    ? formatConsumption(consumptionValue(reading.currentValue, previousValue))
    : formatConsumption(reading.consumption);
}

function formatDate(value: unknown) {
  const raw = text(value);
  if (!raw) return "-";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatPeriodDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()}`;
}

function resolveCurrentSubmissionPeriod(value?: SubmissionPeriodValue | null) {
  if (!value?.startDate || !value?.endDate) return null;
  if (!value.monthly) return { startDate: value.startDate, endDate: value.endDate };

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const startDay = new Date(value.startDate).getDate();
  const endDay = new Date(value.endDate).getDate();
  const lastOfMonth = new Date(year, month + 1, 0).getDate();
  const clamp = (day: number) => Math.min(Math.max(day, 1), lastOfMonth);

  return {
    startDate: toIsoDate(new Date(year, month, clamp(startDay))),
    endDate: toIsoDate(new Date(year, month, clamp(endDay))),
  };
}

function isSubmissionPeriodOpen(value?: SubmissionPeriodValue | null) {
  const period = resolveCurrentSubmissionPeriod(value);
  if (!period) return true;

  const today = toIsoDate(new Date());
  return today >= period.startDate && today <= period.endDate;
}

function submissionClosedMessage(
  value: SubmissionPeriodValue | null | undefined,
  closedDefault: string,
  closedWithDates: (start: string, end: string) => string,
) {
  const period = resolveCurrentSubmissionPeriod(value);
  if (!period) return closedDefault;

  return closedWithDates(formatPeriodDate(period.startDate), formatPeriodDate(period.endDate));
}

function monthLabelFromDate(value: string) {
  const [year = "", month = ""] = value.split("-");
  return month && year ? `${month}.${year}` : value;
}

function meterFromGroup(
  key: ResidentOwnerMeterOption["key"],
  group: unknown,
  meterLabels: MeterLabels = DEFAULT_METER_LABELS,
): ResidentOwnerMeterOption | null {
  if (!group || typeof group !== "object") return null;
  const data = group as UnknownRecord;
  const meterId = text(data.meterId, data.id, data.serialNumber);
  if (!meterId) return null;

  return {
    key,
    id: meterId,
    label: meterLabels[key],
    serialNumber: text(data.serialNumber, data.meterId, "-"),
    previousValue: numberValue(data.currentValue, numberValue(data.previousValue)),
    meterDigits: key === "electricitymeter" ? Math.min(7, Math.max(5, numberValue(data.meterDigits, 6))) : undefined,
  };
}

function normalizeApartment(item: UnknownRecord, meterLabels: MeterLabels = DEFAULT_METER_LABELS): ResidentOwnerApartmentOption | null {
  const id = text(item.id, item.apartmentId);
  if (!id || id === "-") return null;

  const waterReadings = item.waterReadings && typeof item.waterReadings === "object"
    ? item.waterReadings as UnknownRecord
    : {};
  const meters = [
    meterFromGroup("coldmeterwater", waterReadings.coldmeterwater, meterLabels),
    meterFromGroup("hotmeterwater", waterReadings.hotmeterwater, meterLabels),
    meterFromGroup("electricitymeter", waterReadings.electricitymeter, meterLabels),
  ].filter((meter): meter is ResidentOwnerMeterOption => Boolean(meter));

  return {
    id,
    label: text(item.number, item.apartmentNumber, item.readableId, id),
    buildingId: text(item.buildingId),
    submissionPeriod: null,
    meters,
  };
}

function normalizeBuilding(item: UnknownRecord): BuildingOption | null {
  const id = text(item.id, item.buildingId);
  if (!id) return null;

  const readingConfig = item.readingConfig && typeof item.readingConfig === "object"
    ? item.readingConfig as UnknownRecord
    : {};
  const normalizePeriod = (value: unknown) => {
    const periodValue = value && typeof value === "object" ? value as Partial<SubmissionPeriodValue> : null;
    return periodValue?.startDate && periodValue?.endDate
      ? {
          startDate: String(periodValue.startDate),
          endDate: String(periodValue.endDate),
          monthly: Boolean(periodValue.monthly),
        }
      : null;
  };
  const submissionPeriod = normalizePeriod(readingConfig.submissionPeriod);
  const waterSubmissionPeriod = normalizePeriod(readingConfig.waterSubmissionPeriod) ?? submissionPeriod;
  const electricitySubmissionPeriod = normalizePeriod(readingConfig.electricitySubmissionPeriod);

  return {
    id,
    waterEnabled: Boolean(readingConfig.waterEnabled),
    hotWaterMetersPerResident: numberValue(readingConfig.hotWaterMetersPerResident),
    coldWaterMetersPerResident: numberValue(readingConfig.coldWaterMetersPerResident),
    electricityEnabled: Boolean(readingConfig.electricityEnabled),
    electricityMeterDigits: Math.min(7, Math.max(5, numberValue(readingConfig.electricityMeterDigits, 6))),
    electricityUserSetsDigits: Boolean(readingConfig.electricityUserSetsDigits),
    electricityAllowMultipleMonthlySubmissions: Boolean(readingConfig.electricityAllowMultipleMonthlySubmissions),
    electricityFixedPriceEnabled: Boolean(readingConfig.electricityFixedPriceEnabled),
    electricityPricePerKwh: Math.max(0, numberValue(readingConfig.electricityPricePerKwh)),
    submissionPeriod,
    waterSubmissionPeriod,
    electricitySubmissionPeriod,
  };
}

function fallbackMetersFromBuilding(
  apartmentId: string,
  building: BuildingOption | undefined,
  meterLabels: MeterLabels = DEFAULT_METER_LABELS,
): ResidentOwnerMeterOption[] {
  if (!building?.waterEnabled && !building?.electricityEnabled) return [];

  const meters: ResidentOwnerMeterOption[] = [];
  if (building.waterEnabled && numberValue(building.coldWaterMetersPerResident) > 0) {
    meters.push({
      key: "coldmeterwater",
      id: `${apartmentId}:coldmeterwater`,
      label: meterLabels.coldmeterwater,
      serialNumber: "-",
      previousValue: 0,
    });
  }
  if (building.waterEnabled && numberValue(building.hotWaterMetersPerResident) > 0) {
    meters.push({
      key: "hotmeterwater",
      id: `${apartmentId}:hotmeterwater`,
      label: meterLabels.hotmeterwater,
      serialNumber: "-",
      previousValue: 0,
    });
  }
  if (building.electricityEnabled) {
    meters.push({
      key: "electricitymeter",
      id: `${apartmentId}:electricitymeter`,
      label: meterLabels.electricitymeter,
      serialNumber: "-",
      previousValue: 0,
      meterDigits: building.electricityMeterDigits ?? 6,
      userCanSetDigits: building.electricityUserSetsDigits,
    });
  }

  return meters;
}

function normalizeReading(item: UnknownRecord, meterLabels: MeterLabels = DEFAULT_METER_LABELS): ReadingRow {
  const meterKey = text(item.meterKey);
  const previousValue = item.previousValue === null || item.previousValue === undefined ? "-" : numberValue(item.previousValue);
  const currentValue = numberValue(item.currentValue, numberValue(item.value));
  const submittedAtRaw = text(item.submittedAt);
  const submittedAtDate = new Date(submittedAtRaw);
  const month = numberValue(item.month, Number.NaN);
  const year = numberValue(item.year, Number.NaN);

  return {
    id: text(item.id, item.meterId, `${text(item.apartmentId)}-${meterKey}-${text(item.submittedAt)}`),
    apartmentId: text(item.apartmentId),
    apartment: text(item.apartmentNumber, item.apartment, item.apartmentId, "-"),
    meterKey,
    meterLabel: meterKey === "electricitymeter"
      ? meterLabels.electricitymeter
      : meterKey === "hotmeterwater"
        ? meterLabels.hotmeterwater
        : meterLabels.coldmeterwater,
    previousValue,
    currentValue,
    consumption: numberValue(item.consumption, typeof previousValue === "number" ? consumptionValue(currentValue, previousValue) : 0),
    submittedAt: formatDate(item.submittedAt),
    submittedAtTime: Number.isNaN(submittedAtDate.getTime()) ? 0 : submittedAtDate.getTime(),
    month: Number.isFinite(month) ? month : undefined,
    year: Number.isFinite(year) ? year : undefined,
    historyVisible: item.historyVisible !== false,
  };
}

function normalizeInitialReadings(readings: ReadingRow[]) {
  const seenMeterKeys = new Set<string>();
  const firstReadingIds = new Set<string>();
  const ordered = [...readings].sort((a, b) => {
    const monthDiff = readingMonthKey(a).localeCompare(readingMonthKey(b));
    if (monthDiff !== 0) return monthDiff;
    return a.submittedAtTime - b.submittedAtTime;
  });

  for (const reading of ordered) {
    const key = `${reading.apartmentId}:${reading.meterKey}`;
    if (!seenMeterKeys.has(key)) {
      seenMeterKeys.add(key);
      firstReadingIds.add(reading.id);
    }
  }

  return readings.map((reading) => {
    if (!firstReadingIds.has(reading.id)) return reading;
    return {
      ...reading,
      previousValue: "-",
      consumption: 0,
    };
  });
}

function groupReadingsByPeriod(readings: ReadingRow[]): PeriodGroup[] {
  const groups = new Map<string, PeriodGroup>();

  for (const reading of readings) {
    const key = `${reading.submittedAt}:${reading.apartment}`;
    const group = groups.get(key);

    if (group) {
      group.items.push(reading);
    } else {
      groups.set(key, {
        key,
        date: reading.submittedAt,
        apartment: reading.apartment,
        items: [reading],
      });
    }
  }

  return Array.from(groups.values());
}

function groupReadingsByMonth(readings: ReadingRow[]): MonthGroup[] {
  const groupedReadings = new Map<string, ReadingRow[]>();

  for (const reading of readings) {
    const key = readingMonthKey(reading);
    if (!key) continue;
    const group = groupedReadings.get(key);

    if (group) {
      group.push(reading);
    } else {
      groupedReadings.set(key, [reading]);
    }
  }

  return Array.from(groupedReadings.entries())
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([key, items]) => ({
      key,
      label: monthLabelFromDate(`${key}-01`),
      count: items.length,
      periods: groupReadingsByPeriod(items),
    }));
}

function readingBelongsToApartment(reading: ReadingRow, apartment: ResidentOwnerApartmentOption) {
  return reading.apartmentId === apartment.id || reading.apartment === apartment.label;
}

function readingMonthKey(reading: ReadingRow) {
  if (reading.month && reading.year) {
    return `${reading.year}-${String(reading.month).padStart(2, "0")}`;
  }

  return reading.submittedAt.slice(0, 7);
}

function readingMonthLabel(reading: ReadingRow | null | undefined) {
  if (!reading) return undefined;
  return monthLabelFromDate(`${readingMonthKey(reading)}-01`);
}

function previousReadingForMeter(
  apartment: ResidentOwnerApartmentOption,
  meter: ResidentOwnerMeterOption,
  readings: ReadingRow[],
  period: string,
  includeCurrentPeriod = false,
) {
  return readings
    .filter(
      (reading) =>
        reading.meterKey === meter.key &&
        (readingMonthKey(reading) < period || (includeCurrentPeriod && readingMonthKey(reading) <= period)) &&
        readingBelongsToApartment(reading, apartment),
    )
    .sort((a, b) => {
      const monthDiff = readingMonthKey(b).localeCompare(readingMonthKey(a));
      if (monthDiff !== 0) return monthDiff;
      return b.submittedAtTime - a.submittedAtTime;
    })[0] ?? null;
}

function apartmentWithPeriodPreviousValues(
  apartment: ResidentOwnerApartmentOption,
  readings: ReadingRow[],
  period: string,
  includeCurrentPeriodElectricity = false,
) {
  return {
    ...apartment,
    meters: apartment.meters.map((meter) => {
      const previousReading = previousReadingForMeter(
        apartment,
        meter,
        readings,
        period,
        includeCurrentPeriodElectricity && meter.key === "electricitymeter",
      );

      return {
        ...meter,
        previousValue: previousReading ? previousReading.currentValue : "—",
        previousPeriod: readingMonthLabel(previousReading),
      };
    }),
  };
}

function hasSubmittedCurrentMonth(
  apartment: ResidentOwnerApartmentOption | undefined,
  readings: ReadingRow[],
  period: string,
) {
  if (!apartment || apartment.meters.length === 0) return false;

  const submittedMeterKeys = new Set(
    readings
      .filter((reading) => readingMonthKey(reading) === period && readingBelongsToApartment(reading, apartment))
      .map((reading) => reading.meterKey),
  );

  return apartment.meters.every((meter) => submittedMeterKeys.has(meter.key));
}

function sortReadingsByDate(readings: ReadingRow[]) {
  return readings.sort((a, b) => b.submittedAtTime - a.submittedAtTime);
}

export function ResidentOwnerMeterReadings() {
  const t = useTranslations("meterReadings.resident");
  const notify = useNotifications();
  const meterLabels: MeterLabels = {
    coldmeterwater: t("meterLabels.coldWater"),
    hotmeterwater: t("meterLabels.hotWater"),
    electricitymeter: t("meterLabels.electricity"),
  };
  const [apartments, setApartments] = useState<ResidentOwnerApartmentOption[]>([]);
  const [readings, setReadings] = useState<ReadingRow[]>([]);
  const [selectedApartmentId, setSelectedApartmentId] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [meterDigits, setMeterDigits] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openHistoryMonth, setOpenHistoryMonth] = useState<string | null | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<UtilityTab>("water");
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [advanceKwh, setAdvanceKwh] = useState("");
  const [advanceSaving, setAdvanceSaving] = useState(false);
  const period = currentMonth();
  const hasWaterTab = apartments.some((apartment) => apartment.meters.some((meter) => meterMatchesTab(meter, "water")));
  const hasElectricityTab = apartments.some((apartment) => apartment.meters.some((meter) => meterMatchesTab(meter, "electricity")));
  const availableTabs = useMemo<UtilityTab[]>(() => [
    ...(hasWaterTab ? (["water"] as const) : []),
    ...(hasElectricityTab ? (["electricity"] as const) : []),
  ], [hasElectricityTab, hasWaterTab]);
  const effectiveTab = availableTabs.includes(activeTab) ? activeTab : availableTabs[0] ?? activeTab;
  const tabReadings = readings.filter((reading) => reading.historyVisible && readingMatchesTab(reading, effectiveTab));
  const monthGroups = groupReadingsByMonth(tabReadings);
  const firstHistoryMonth = monthGroups[0]?.key;

  useEffect(() => {
    if (openHistoryMonth === undefined && firstHistoryMonth) {
      setOpenHistoryMonth(firstHistoryMonth);
    }
  }, [firstHistoryMonth, openHistoryMonth]);

  const visibleApartments = selectedApartmentId
    ? apartments.filter((apartment) => apartment.id === selectedApartmentId)
    : apartments.slice(0, 1);
  const visibleTabApartments = visibleApartments
    .map((apartment) => ({
      ...apartment,
      meters: apartment.meters.filter((meter) => meterMatchesTab(meter, effectiveTab)),
    }))
    .filter((apartment) => apartment.meters.length > 0);
  const selectedSubmissionPeriod = effectiveTab === "water"
    ? visibleApartments[0]?.waterSubmissionPeriod ?? visibleApartments[0]?.submissionPeriod ?? null
    : visibleApartments[0]?.electricitySubmissionPeriod ?? null;
  const submissionOpen = isSubmissionPeriodOpen(selectedSubmissionPeriod);
  const electricityAllowsMultipleMonthlySubmissions = effectiveTab === "electricity"
    && Boolean(visibleTabApartments[0]?.electricityAllowMultipleMonthlySubmissions);
  const currentMonthSubmitted = electricityAllowsMultipleMonthlySubmissions
    ? false
    : hasSubmittedCurrentMonth(visibleTabApartments[0], tabReadings, period);
  const missingCurrentMonthApartments = apartments
    .map((apartment) => ({
      ...apartment,
      meters: apartment.meters.filter((meter) => meterMatchesTab(meter, effectiveTab)),
    }))
    .filter((apartment) => apartment.meters.length > 0 && !hasSubmittedCurrentMonth(apartment, tabReadings, period));
  const submitApartments = visibleTabApartments.map((apartment) =>
    apartmentWithPeriodPreviousValues(apartment, tabReadings, period, electricityAllowsMultipleMonthlySubmissions),
  );
  const advanceApartment = visibleTabApartments[0];
  const advancePricePerKwh = advanceApartment?.electricityFixedPriceEnabled
    ? Math.max(0, advanceApartment.electricityPricePerKwh ?? 0)
    : 0;
  const advanceKwhValue = numberValue(advanceKwh, 0);
  const advanceAmount = Number((Math.max(0, advanceKwhValue) * advancePricePerKwh).toFixed(2));

  useEffect(() => {
    if (availableTabs.length > 0 && activeTab !== effectiveTab) {
      setActiveTab(effectiveTab);
    }
  }, [activeTab, availableTabs, effectiveTab]);

  const loadData = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setError(null);
      const apartmentsResponse = await apiFetch<{ apartments?: UnknownRecord[]; buildings?: UnknownRecord[] }>("/resident/apartments");
      const buildingOptions = new Map(
        (apartmentsResponse.buildings ?? [])
          .map(normalizeBuilding)
          .filter((item): item is BuildingOption => Boolean(item))
          .map((building) => [building.id, building] as const),
      );
      const normalizedApartments = (apartmentsResponse.apartments ?? [])
        .map((item) => normalizeApartment(item, meterLabels))
        .filter((item): item is ResidentOwnerApartmentOption => Boolean(item))
        .map((apartment) => {
          const building = buildingOptions.get(apartment.buildingId);
          const allowedKeys = allowedMeterKeysForBuilding(building);
          const configuredMeters = allowedKeys.size > 0
            ? apartment.meters.filter((meter) => allowedKeys.has(meter.key))
            : apartment.meters;
          const fallbackMeters = fallbackMetersFromBuilding(apartment.id, building, meterLabels);
          const existingKeys = new Set(configuredMeters.map((meter) => meter.key));

          return {
            ...apartment,
            meters: [
              ...configuredMeters,
              ...fallbackMeters.filter((meter) => !existingKeys.has(meter.key)),
            ],
            submissionPeriod: building?.submissionPeriod ?? apartment.submissionPeriod ?? null,
            waterSubmissionPeriod: building?.waterSubmissionPeriod ?? building?.submissionPeriod ?? apartment.waterSubmissionPeriod ?? apartment.submissionPeriod ?? null,
            electricitySubmissionPeriod: building?.electricitySubmissionPeriod ?? apartment.electricitySubmissionPeriod ?? null,
            electricityAllowMultipleMonthlySubmissions: Boolean(
              building?.electricityAllowMultipleMonthlySubmissions ?? apartment.electricityAllowMultipleMonthlySubmissions,
            ),
            electricityFixedPriceEnabled: Boolean(building?.electricityFixedPriceEnabled ?? apartment.electricityFixedPriceEnabled),
            electricityPricePerKwh: building?.electricityPricePerKwh ?? apartment.electricityPricePerKwh ?? 0,
          };
        });

      const readingBatches = await Promise.all(
        normalizedApartments.map((apartment) =>
          apiFetch<{ items?: UnknownRecord[] }>(`/meter-readings?apartmentId=${encodeURIComponent(apartment.id)}`)
            .catch(() => ({ items: [] })),
        ),
      );

      const activeMeterKeysByApartment = new Map(
        normalizedApartments.map((apartment) => [
          apartment.id,
          new Set(apartment.meters.map((meter) => meter.key)),
        ]),
      );
      const normalizedReadings = readingBatches
        .flatMap((response) => response.items ?? [])
        .map((item) => normalizeReading(item, meterLabels))
        .filter((reading) => activeMeterKeysByApartment.get(reading.apartmentId)?.has(reading.meterKey as ResidentOwnerMeterOption["key"]));

      setApartments(normalizedApartments);
      setReadings(sortReadingsByDate(normalizeInitialReadings(normalizedReadings)));
      setSelectedApartmentId((current) =>
        normalizedApartments.some((apartment) => apartment.id === current)
          ? current
          : normalizedApartments[0]?.id ?? "",
      );
      setValues({});
      setMeterDigits({});
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : t("loadFailed"));
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (loading || error) return;
    notifyOwnerMeterReadingStatus(
      missingCurrentMonthApartments.length,
      missingCurrentMonthApartments.map((apartment) => `№ ${apartment.label}`),
    );
  }, [error, loading, missingCurrentMonthApartments]);

  const submitReadings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const [yearRaw, monthRaw] = period.split("-");
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    const targetApartments = selectedApartmentId
      ? apartments.filter((apartment) => apartment.id === selectedApartmentId)
      : apartments.slice(0, 1);
    const filledMeters = targetApartments.flatMap((apartment) =>
      apartment.meters
        .filter((meter) => values[residentOwnerMeterValueKey(apartment.id, meter.key)]?.trim())
        .map((meter) => ({ apartment, meter })),
    );

    if (filledMeters.length === 0) {
      notify.info(t("enterAtLeastOne"));
      return;
    }

    if (!submissionOpen) {
      notify.info(t("submissionClosed"));
      return;
    }

    if (currentMonthSubmitted) {
      notify.info(t("alreadySubmitted"));
      return;
    }

    for (const { apartment, meter } of filledMeters) {
      const currentValue = numberValue(values[residentOwnerMeterValueKey(apartment.id, meter.key)], NaN);
      const previousReading = previousReadingForMeter(
        apartment,
        meter,
        readings,
        period,
        electricityAllowsMultipleMonthlySubmissions && meter.key === "electricitymeter",
      );
      const previousValue = previousReading ? previousReading.currentValue : 0;
      if (!Number.isFinite(currentValue)) {
        notify.error(t("mustBeNumber"));
        return;
      }
      if (previousReading && currentValue < previousValue) {
        notify.error(t("belowPrevious", { meter: meter.label }));
        return;
      }
    }

    try {
      setSubmitting(true);
      const submittedAtDate = new Date();
      const submittedAt = toIsoDate(submittedAtDate);
      const submittedAtTimeBase = submittedAtDate.getTime();
      const optimisticReadings: ReadingRow[] = [];
      let optimisticIndex = 0;

      for (const { apartment, meter } of filledMeters) {
        const currentValue = numberValue(values[residentOwnerMeterValueKey(apartment.id, meter.key)]);
        const previousReading = previousReadingForMeter(
          apartment,
          meter,
          readings,
          period,
          electricityAllowsMultipleMonthlySubmissions && meter.key === "electricitymeter",
        );
        const previousValue = previousReading ? previousReading.currentValue : 0;
        const hasPreviousValue = Boolean(previousReading);
        const meterValueKey = residentOwnerMeterValueKey(apartment.id, meter.key);
        await apiFetch("/meter-readings", {
          method: "POST",
          body: JSON.stringify({
            apartmentId: apartment.id,
            meterId: meter.id,
            meterKey: meter.key,
            meterDigits: meter.key === "electricitymeter"
              ? Math.min(7, Math.max(5, meterDigits[meterValueKey] ?? meter.meterDigits ?? 6))
              : undefined,
            previousValue,
            currentValue,
            consumption: hasPreviousValue ? consumptionValue(currentValue, previousValue) : 0,
            buildingId: apartment.buildingId,
            month,
            year,
          }),
        });

        optimisticReadings.push({
          id: `submitted-${apartment.id}-${meter.key}-${period}-${optimisticIndex}`,
          apartmentId: apartment.id,
          apartment: apartment.label,
          meterKey: meter.key,
          meterLabel: meter.label,
          previousValue: hasPreviousValue ? previousValue : "-",
          currentValue,
          consumption: hasPreviousValue ? consumptionValue(currentValue, previousValue) : 0,
          submittedAt,
          submittedAtTime: submittedAtTimeBase + optimisticIndex,
          month,
          year,
          historyVisible: true,
        });
        optimisticIndex += 1;
      }

      setReadings((current) => {
        const submittedKeys = new Set(
          optimisticReadings.map((reading) => `${reading.apartmentId}:${reading.meterKey}:${readingMonthKey(reading)}`),
        );
        const keptReadings = electricityAllowsMultipleMonthlySubmissions
          ? current
          : current.filter(
              (reading) => !submittedKeys.has(`${reading.apartmentId}:${reading.meterKey}:${readingMonthKey(reading)}`),
            );

        return sortReadingsByDate([...optimisticReadings, ...keptReadings]);
      });
      setApartments((current) =>
        current.map((apartment) => ({
          ...apartment,
          meters: apartment.meters.map((meter) => {
            const submittedReading = optimisticReadings.find(
              (reading) => reading.apartmentId === apartment.id && reading.meterKey === meter.key,
            );

            return submittedReading ? { ...meter, previousValue: submittedReading.currentValue } : meter;
          }),
        })),
      );
      setValues({});
      setMeterDigits({});
      notify.success(t("submitted"));
      notifyMeterReadingsChanged();
    } catch (caughtError) {
      notify.error(caughtError instanceof Error ? caughtError.message : t("submitFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const submitAdvancePayment = async () => {
    if (!advanceApartment) return;
    const paidKwh = numberValue(advanceKwh, NaN);
    if (!Number.isFinite(paidKwh) || paidKwh <= 0) {
      notify.info(t("advanceKwhRequired"));
      return;
    }
    if (advancePricePerKwh <= 0) {
      notify.info(t("advanceTariffMissing"));
      return;
    }

    setAdvanceSaving(true);
    try {
      await apiFetch("/meter-readings/electricity-payments", {
        method: "POST",
        body: JSON.stringify({
          apartmentId: advanceApartment.id,
          amount: Number((paidKwh * advancePricePerKwh).toFixed(2)),
          paidKwh,
          paidAt: toIsoDate(new Date()),
          note: "",
        }),
        headers: { "Content-Type": "application/json" },
      });
      setAdvanceKwh("");
      setAdvanceOpen(false);
      notify.success(t("advanceSubmitted"));
    } catch (caughtError) {
      notify.error(caughtError instanceof Error ? caughtError.message : t("advanceSubmitFailed"));
    } finally {
      setAdvanceSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionCard title={t("submitTitle")} description={t("submitDescription")}>
        {loading ? (
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-6 text-center text-slate-500">{t("loading")}</div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        ) : apartments.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-slate-600">{t("noApartments")}</div>
        ) : (
          <div className="space-y-4">
            {availableTabs.length > 1 ? (
              <div className="inline-flex rounded-xl bg-slate-100 p-1">
                {availableTabs.map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => {
                      setActiveTab(tab);
                      setOpenHistoryMonth(undefined);
                    }}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                      effectiveTab === tab
                        ? tab === "electricity"
                          ? "bg-amber-400 text-slate-950 shadow-sm"
                          : "bg-blue-600 text-white shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {tab === "electricity" ? t("electricityTab") : t("waterTab")}
                  </button>
                ))}
              </div>
            ) : null}
            <ResidentOwnerSubmitForm
              apartments={submitApartments}
              apartmentOptions={apartments}
              selectedApartmentId={selectedApartmentId}
              submissionOpen={submissionOpen}
              currentMonthSubmitted={currentMonthSubmitted}
              closedMessage={submissionClosedMessage(
                selectedSubmissionPeriod,
                t("closedDefault"),
                (start, end) => t("closedWithDates", { start, end }),
              )}
              values={values}
              meterDigits={meterDigits}
              period={period}
              submitting={submitting}
              onApartmentChange={(apartmentId) => setSelectedApartmentId(apartmentId)}
              onSubmit={submitReadings}
              onValueChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))}
              onMeterDigitsChange={(key, value) => setMeterDigits((current) => ({ ...current, [key]: value }))}
            />
            {effectiveTab === "electricity" && advanceApartment && advancePricePerKwh > 0 ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">{t("advanceTitle")}</h4>
                    <p className="mt-1 text-sm text-slate-600">{t("advanceDescription")}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAdvanceOpen(true)}
                    className="rounded-xl bg-amber-400 px-4 py-2 text-sm font-bold text-slate-950 shadow-sm hover:bg-amber-300"
                  >
                    {t("advanceButton")}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {!loading && !error ? (
          <div className="mt-8 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 sm:text-2xl sm:normal-case sm:tracking-normal sm:text-slate-950">
              {t("historyTitle")}
            </h3>
            {monthGroups.length > 0 ? (
              <div className="space-y-3">
                {monthGroups.map((monthGroup) => (
                  <details
                    key={monthGroup.key}
                    open={openHistoryMonth === monthGroup.key}
                    className="group overflow-hidden rounded-lg border border-slate-200 bg-white sm:rounded-2xl"
                  >
                    <summary
                      className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 transition hover:bg-slate-50 sm:bg-slate-50 sm:hover:bg-slate-100"
                      onClick={(event) => {
                        event.preventDefault();
                        setOpenHistoryMonth((current) => current === monthGroup.key ? null : monthGroup.key);
                      }}
                    >
                      <div className="flex min-w-0 items-baseline gap-2 sm:block">
                        <p className="font-mono text-sm font-bold text-slate-800 sm:hidden">{monthGroup.key}</p>
                        <p className="hidden font-semibold text-slate-900 sm:block">{monthGroup.label}</p>
                        <p className="hidden whitespace-nowrap text-sm text-slate-500 sm:block">
                          {t("readingsCount", { count: monthGroup.count })}
                        </p>
                      </div>
                      <span className="text-xl leading-none text-slate-400 transition group-open:rotate-180">⌄</span>
                    </summary>

                    <div className="space-y-2 border-t border-slate-100 bg-slate-50/40 p-2.5 sm:hidden">
                      {monthGroup.periods.flatMap((periodGroup) => periodGroup.items).map((reading) => {
                        const isHotWater = reading.meterKey === "hotmeterwater";
                        const isElectricity = reading.meterKey === "electricitymeter";
                        const dotClass = isElectricity ? "bg-amber-400" : isHotWater ? "bg-rose-500" : "bg-blue-500";
                        const totalClass = isElectricity ? "text-amber-600" : isHotWater ? "text-rose-600" : "text-blue-600";

                        return (
                          <div key={reading.id} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2.5">
                            <div className="flex min-w-0 items-center gap-2">
                              <span
                                aria-hidden="true"
                                className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`}
                              />
                              <span className="truncate text-sm font-medium text-slate-800">{reading.meterLabel}</span>
                            </div>
                            <div className="shrink-0 text-right text-sm leading-tight">
                              <p className="whitespace-nowrap tabular-nums text-slate-500">
                                {reading.previousValue} <span aria-hidden="true">→</span>{" "}
                                <span className="font-bold text-slate-900">{reading.currentValue}</span>
                              </p>
                              <p className={`mt-0.5 whitespace-nowrap tabular-nums font-bold ${totalClass}`}>
                                +{readingConsumption(reading)} {isElectricity ? "kWh" : "m3"}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="hidden space-y-3 p-3 sm:block">
                      {monthGroup.periods.map((group) => (
                        <div key={group.key} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50/70 px-4 py-2.5">
                            <div>
                              <p className="text-xs text-slate-500">{t("date")}</p>
                              <p className="text-sm font-semibold text-slate-900">{group.date}</p>
                            </div>
                            <div className="text-left sm:text-right">
                              <p className="text-xs text-slate-500">{t("apartment")}</p>
                              <p className="text-sm font-semibold text-slate-900">{group.apartment}</p>
                            </div>
                          </div>
                          <div className="hidden overflow-x-auto sm:block">
                            <table className="w-full min-w-[560px] text-sm">
                              <thead className="text-left text-slate-500">
                                <tr>
                                  <th className="px-4 py-2 font-semibold">{t("meter")}</th>
                                  <th className="px-4 py-2 text-right font-semibold">{t("previousShort")}</th>
                                  <th className="px-4 py-2 text-right font-semibold">{t("currentShort")}</th>
                                  <th className="px-4 py-2 text-right font-semibold">{t("consumption")}</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {group.items.map((reading) => (
                                  <tr key={reading.id}>
                                    <td className="px-4 py-3 text-slate-700">{reading.meterLabel}</td>
                                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">{reading.previousValue}</td>
                                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-900">{reading.currentValue}</td>
                                    <td className={`px-4 py-3 text-right tabular-nums ${reading.meterKey === "electricitymeter" ? "text-amber-700" : "text-blue-700"}`}>
                                      {readingConsumption(reading)} {reading.meterKey === "electricitymeter" ? "kWh" : "m3"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-slate-500">
                {t("emptyHistory")}
              </div>
            )}
          </div>
        ) : null}
      </SectionCard>
      <Modal
        open={advanceOpen}
        onClose={() => setAdvanceOpen(false)}
        title={t("advanceTitle")}
        size="md"
        footer={
          <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setAdvanceOpen(false)}
              disabled={advanceSaving}
              className="min-h-11 rounded-xl px-4"
            >
              {t("advanceCancel")}
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={submitAdvancePayment}
              disabled={advanceSaving || advanceKwhValue <= 0}
              className="min-h-11 rounded-xl px-4"
            >
              {advanceSaving ? t("advanceSaving") : t("advanceSubmit")}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">{t("advanceModalDescription")}</p>
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">{t("advanceKwh")}</span>
            <input
              type="number"
              min="0"
              step="0.001"
              value={advanceKwh}
              onChange={(event) => setAdvanceKwh(event.target.value)}
              className="h-12 w-full rounded-xl border border-amber-200 bg-white px-3 text-base font-semibold text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
            />
          </label>
          <div className="grid gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("advanceTariff")}</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{advancePricePerKwh.toFixed(2)} EUR/kWh</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("advanceCalculatedAmount")}</p>
              <p className="mt-1 text-lg font-bold text-amber-700">{advanceAmount.toFixed(2)} EUR</p>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
