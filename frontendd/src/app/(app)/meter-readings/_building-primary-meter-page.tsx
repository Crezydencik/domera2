"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertModal } from "@/components/ui/alert-modal";
import { Button } from "@/components/ui/button";
import MeterReadingInput from "../../../components/ui/meter-reading-input";
import { apiFetch } from "@/shared/api/client";
import { useAuthSession } from "@/shared/hooks/use-auth";
import { notifyMeterReadingsChanged } from "@/shared/hooks/use-app-notifications";
import { useNotifications } from "@/shared/hooks/use-notifications";
import { ROUTES } from "@/shared/lib/routes";
import type { MeterReadingsInitialData } from "@/shared/server/page-loaders/meter-readings.loader";

type UnknownRecord = Record<string, unknown>;

type MeterReadingRecord = {
  id: string;
  currentValue: string;
  previousValue: string;
  consumption: string;
  submittedAt: string;
  month?: number;
  year?: number;
  isInitialReading?: boolean;
  status: "submitted" | "pending" | "verified";
};

type MeterInfo = {
  meterType: string;
  meterKey?: "coldmeterwater" | "hotmeterwater" | "electricitymeter";
  meterId?: string;
  serialNumber?: string;
  meterDigits?: number;
  readings: MeterReadingRecord[];
  latestReading: MeterReadingRecord | null;
};

type ApartmentMeterData = {
  id: string;
  apartmentId: string;
  apartment: string;
  building: string;
  buildingLabel: string;
  residentEmail?: string;
  ownerEmail?: string;
  meters: MeterInfo[];
};

type ManagedBuildingOption = {
  id: string;
  label: string;
  apartmentCount: number;
  coldWaterEnabled: boolean;
  hotWaterEnabled: boolean;
  buildingMainMeterEntries: BuildingMainMeterEntry[];
};

type MonthlyWaterSummary = {
  monthKey: string;
  label: string;
  cold: number;
  hot: number;
  total: number;
  readingsCount: number;
  submittedApartmentCount: number;
};

type BuildingMainMeterEntry = {
  monthKey: string;
  readingDate: string;
  currentValue?: number | null;
  coldCurrentValue?: number | null;
  hotCurrentValue?: number | null;
};

type BuildingHistoryRow = {
  monthKey: string;
  label: string;
  year: string;
  coldMainCurrentValue: number | null;
  coldMainPreviousValue: number | null;
  coldMainConsumption: number;
  hotMainCurrentValue: number | null;
  hotMainPreviousValue: number | null;
  hotMainConsumption: number;
  mainConsumptionTotal: number;
  residentCold: number;
  residentHot: number;
  residentTotal: number;
  coldDifference: number;
  hotDifference: number;
  differenceTotal: number;
  readingDate: string | null;
};

type CombinedChartSeriesKey = "house" | "apartmentsTotal" | "apartmentsCold" | "apartmentsHot" | "submittedApartments";

type Props = {
  initialCompanyId?: string;
  initialData?: MeterReadingsInitialData;
  canManageReadings?: boolean;
};

function text(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function consumptionValue(currentValue: number, previousValue: number) {
  return Number(Math.max(0, currentValue - previousValue).toFixed(3));
}

function formatCubic(value: number) {
  return `${value.toFixed(3)} m3`;
}

function isHotWaterMeter(meter: MeterInfo) {
  return meter.meterKey === "hotmeterwater" || meter.meterType.toLowerCase().includes("hot");
}

function isElectricityMeter(meter: MeterInfo | undefined) {
  return Boolean(meter && (meter.meterKey === "electricitymeter" || meter.meterType.toLowerCase().includes("electric")));
}

function allowedMeterKeysFromBuilding(building: UnknownRecord | undefined) {
  const readingConfig = building?.readingConfig && typeof building.readingConfig === "object"
    ? building.readingConfig as UnknownRecord
    : null;
  if (!readingConfig) return null;

  const hasExplicitConfig = Object.prototype.hasOwnProperty.call(readingConfig, "waterEnabled")
    || Object.prototype.hasOwnProperty.call(readingConfig, "electricityEnabled");
  if (!hasExplicitConfig) return null;

  const keys = new Set<MeterInfo["meterKey"]>();
  if (readingConfig.waterEnabled) {
    keys.add("coldmeterwater");
    keys.add("hotmeterwater");
  }
  if (readingConfig.electricityEnabled) {
    keys.add("electricitymeter");
  }
  return keys;
}

function meterFromWaterReading(
  key: "coldmeterwater" | "hotmeterwater" | "electricitymeter",
  group: unknown,
  fallbackApartmentId: string,
): MeterInfo | null {
  if (!group || typeof group !== "object") return null;
  const data = group as UnknownRecord;
  const meterId = text(data.meterId, data.id, data.serialNumber, `${fallbackApartmentId}:${key}`);
  const isHot = key === "hotmeterwater";
  const isElectricity = key === "electricitymeter";

  return {
    meterType: isElectricity ? "Electricity" : isHot ? "Hot Water" : "Cold Water",
    meterKey: key,
    meterId,
    serialNumber: text(data.serialNumber),
    meterDigits: isElectricity ? Math.min(7, Math.max(5, numberValue(data.meterDigits) || 6)) : undefined,
    readings: [],
    latestReading: null,
  };
}

function fallbackMetersFromBuilding(apartmentId: string, building: UnknownRecord | undefined): MeterInfo[] {
  const readingConfig = building?.readingConfig && typeof building.readingConfig === "object"
    ? building.readingConfig as UnknownRecord
    : {};

  if (!readingConfig.waterEnabled && !readingConfig.electricityEnabled) return [];

  const meters: MeterInfo[] = [];
  if (readingConfig.waterEnabled && numberValue(readingConfig.coldWaterMetersPerResident) > 0) {
    meters.push({
      meterType: "Cold Water",
      meterKey: "coldmeterwater",
      meterId: `${apartmentId}:coldmeterwater`,
      serialNumber: "",
      readings: [],
      latestReading: null,
    });
  }
  if (readingConfig.waterEnabled && numberValue(readingConfig.hotWaterMetersPerResident) > 0) {
    meters.push({
      meterType: "Hot Water",
      meterKey: "hotmeterwater",
      meterId: `${apartmentId}:hotmeterwater`,
      serialNumber: "",
      readings: [],
      latestReading: null,
    });
  }
  if (readingConfig.electricityEnabled) {
    meters.push({
      meterType: "Electricity",
      meterKey: "electricitymeter",
      meterId: `${apartmentId}:electricitymeter`,
      serialNumber: "",
      meterDigits: Math.min(7, Math.max(5, numberValue(readingConfig.electricityMeterDigits) || 6)),
      readings: [],
      latestReading: null,
    });
  }

  return meters;
}

function monthKeyFromDateString(raw: string | null | undefined) {
  if (!raw || raw === "—") return "";

  const isoMatch = /^(\d{4})-(\d{2})/.exec(raw);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}`;

  const localMatch = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(raw);
  if (localMatch) return `${localMatch[3]}-${localMatch[2]}`;

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function readingMonthKey(reading: MeterReadingRecord | null | undefined) {
  if (!reading) return "";
  if (reading.month && reading.year) {
    return `${reading.year}-${String(reading.month).padStart(2, "0")}`;
  }
  return monthKeyFromDateString(reading.submittedAt);
}

function monthLabelFromKey(monthKey: string) {
  const [year, month] = monthKey.split("-");
  return year && month ? `${month}.${year}` : monthKey;
}

function readingConsumptionNumber(reading: MeterReadingRecord | null | undefined) {
  if (reading?.isInitialReading) return 0;
  if (!reading) return 0;
  const currentValue = Number(String(reading.currentValue ?? "").replace(",", "."));
  const previousValue = Number(String(reading.previousValue ?? "").replace(",", "."));
  if (Number.isFinite(currentValue) && Number.isFinite(previousValue)) {
    return consumptionValue(currentValue, previousValue);
  }

  const storedConsumption = Number(String(reading.consumption ?? "").replace(",", "."));
  return Number.isFinite(storedConsumption) ? Number(storedConsumption.toFixed(3)) : 0;
}

function compareReadingsAscending(left: MeterReadingRecord, right: MeterReadingRecord) {
  const leftMonth = readingMonthKey(left);
  const rightMonth = readingMonthKey(right);
  if (leftMonth !== rightMonth) return leftMonth.localeCompare(rightMonth);
  return String(left.submittedAt).localeCompare(String(right.submittedAt));
}

function latestReadingForMonth(meter: MeterInfo | undefined, monthKey: string) {
  if (!meter) return null;

  return meter.readings
    .filter((reading) => readingMonthKey(reading) === monthKey)
    .sort((left, right) => String(right.submittedAt).localeCompare(String(left.submittedAt)))[0] ?? null;
}

function normalizeInitialMeterReadings(apartments: ApartmentMeterData[]) {
  return apartments.map((apartment) => ({
    ...apartment,
    meters: apartment.meters.map((meter) => {
      if (meter.readings.length === 0) return meter;
      const firstReading = [...meter.readings].sort(compareReadingsAscending)[0];
      const readings = meter.readings.map((reading) =>
        reading === firstReading || reading.id === firstReading.id
          ? { ...reading, previousValue: "-", consumption: "0.000", isInitialReading: true }
          : { ...reading, isInitialReading: false },
      );
      const latestReading = readings
        .slice()
        .sort((left, right) => readingMonthKey(right).localeCompare(readingMonthKey(left)))[0] ?? null;

      return { ...meter, readings, latestReading };
    }),
  }));
}

function buildManagementMeterReadingsState(initialData: MeterReadingsInitialData) {
  const response = initialData.readingsResponse;
  const items = Array.isArray(response)
    ? (response as unknown[])
    : ((response as { items?: unknown[] } | null)?.items ?? []);
  const buildingItems = Array.isArray((initialData.buildingsResponse as { items?: unknown[] } | null)?.items)
    ? ((initialData.buildingsResponse as { items?: unknown[] }).items ?? [])
    : [];
  const apartmentItems = Array.isArray((initialData.apartmentsResponse as { items?: unknown[] } | null)?.items)
    ? ((initialData.apartmentsResponse as { items?: unknown[] }).items ?? [])
    : [];

  const buildingDataById = new Map<string, UnknownRecord>();
  buildingItems.forEach((item) => {
    const building = item as UnknownRecord;
    const id = text(building.id, building.buildingId);
    if (id) buildingDataById.set(id, building);
  });

  const managedBuildings: ManagedBuildingOption[] = buildingItems
    .map((item) => {
      const building = item as UnknownRecord;
      const id = text(building.id, building.buildingId);
      const label = text(building.address, building.street, building.location, building.name, building.title, id);
      const apartmentCount = Number(building.apartmentsCount ?? building.apartments ?? 0);
      const readingConfig = building.readingConfig && typeof building.readingConfig === "object"
        ? building.readingConfig as UnknownRecord
        : {};
      return id ? {
        id,
        label,
        apartmentCount: Number.isFinite(apartmentCount) ? apartmentCount : 0,
        coldWaterEnabled: Boolean(readingConfig.waterEnabled) && numberValue(readingConfig.coldWaterMetersPerResident) > 0,
        hotWaterEnabled: Boolean(readingConfig.waterEnabled) && numberValue(readingConfig.hotWaterMetersPerResident) > 0,
        buildingMainMeterEntries: normalizeBuildingMainMeterEntries(building.buildingMainMeterEntries),
      } : null;
    })
    .filter((item): item is ManagedBuildingOption => Boolean(item))
    .sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: "base" }));

  const apartmentMap = new Map<string, ApartmentMeterData>();

  apartmentItems.forEach((item: unknown) => {
    const apartment = item as UnknownRecord;
    const apartmentId = text(apartment.id, apartment.apartmentId, apartment.readableId);
    if (!apartmentId) return;

    const buildingId = text(apartment.buildingId);
    const buildingData = buildingDataById.get(buildingId);
    const buildingLabel = text(
      apartment.buildingAddress,
      apartment.buildingName,
      buildingData?.address,
      buildingData?.street,
      buildingData?.location,
      buildingData?.name,
      buildingData?.title,
      buildingId ? `#${buildingId}` : "Unknown",
    );
    const waterReadings = apartment.waterReadings && typeof apartment.waterReadings === "object"
      ? apartment.waterReadings as UnknownRecord
      : {};
    const meters = [
      meterFromWaterReading("coldmeterwater", waterReadings.coldmeterwater, apartmentId),
      meterFromWaterReading("hotmeterwater", waterReadings.hotmeterwater, apartmentId),
      meterFromWaterReading("electricitymeter", waterReadings.electricitymeter, apartmentId),
    ].filter((meter): meter is MeterInfo => Boolean(meter));
    const allowedKeys = allowedMeterKeysFromBuilding(buildingData);
    const configuredMeters = allowedKeys ? meters.filter((meter) => allowedKeys.has(meter.meterKey)) : meters;
    const existingKeys = new Set(configuredMeters.map((meter) => meter.meterKey));
    const fallbackMeters = fallbackMetersFromBuilding(apartmentId, buildingData).filter((meter) => !existingKeys.has(meter.meterKey));

    apartmentMap.set(apartmentId, {
      id: apartmentId,
      apartmentId,
      apartment: text(apartment.number, apartment.apartmentNumber, apartment.label, apartment.name, apartmentId),
      building: buildingId || buildingLabel,
      buildingLabel,
      residentEmail: text(apartment.residentEmail),
      ownerEmail: text(apartment.ownerEmail),
      meters: [...configuredMeters, ...fallbackMeters],
    });
  });

  items.forEach((item: unknown) => {
    const i = item as UnknownRecord;
    const apartmentId = String(i.apartmentId || "");
    if (!apartmentId) return;
    const apartmentNumber = String(i.apartmentNumber || i.apartment || apartmentId || "—");
    const buildingId = String(i.buildingId || "");
    const buildingName = String(i.buildingName || "");
    const buildingAddress = String(i.buildingAddress || "");
    const existingApartment = apartmentMap.get(apartmentId);
    const buildingLabel = buildingAddress || buildingName || existingApartment?.buildingLabel || (buildingId ? `#${buildingId}` : "Unknown");
    const building = buildingId || existingApartment?.building || buildingLabel;

    let meterType = "Water";
    const meterKey = String(i.meterKey || "");
    const meterNameValue = String(i.meterName || "");
    if (meterKey === "electricitymeter" || meterNameValue.toLowerCase().includes("electric")) {
      meterType = "Electricity";
    } else if (meterKey === "hotmeterwater" || meterNameValue.toLowerCase().includes("hot")) {
      meterType = "Hot Water";
    } else if (meterKey === "coldmeterwater" || meterNameValue.toLowerCase().includes("cold")) {
      meterType = "Cold Water";
    }

    let date: Date | null = null;
    if (i.submittedAt) date = new Date(String(i.submittedAt));
    const formattedDate = date && !Number.isNaN(date.getTime())
      ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
      : "—";

    const reading: MeterReadingRecord = {
      id: String(i.id || `${apartmentId}:${meterKey}:${formattedDate}`),
      currentValue: String(i.currentValue || "0"),
      previousValue: i.previousValue === null || i.previousValue === undefined ? "—" : String(i.previousValue || "0"),
      consumption: String(i.consumption || "0"),
      submittedAt: formattedDate,
      month: typeof i.month === "number" ? i.month : Number(i.month) || undefined,
      year: typeof i.year === "number" ? i.year : Number(i.year) || undefined,
      status: (i.status as "submitted" | "pending" | "verified") || "submitted",
    };

    const meterKeyTyped =
      meterKey === "hotmeterwater" || meterKey === "coldmeterwater" || meterKey === "electricitymeter"
        ? (meterKey as "hotmeterwater" | "coldmeterwater" | "electricitymeter")
        : undefined;

    if (apartmentMap.has(apartmentId)) {
      const existing = apartmentMap.get(apartmentId)!;
      const existingMeter = existing.meters.find((meter) => meter.meterType === meterType || (meterKeyTyped && meter.meterKey === meterKeyTyped));
      if (existingMeter) {
        existingMeter.readings.push(reading);
        existingMeter.readings.sort((left, right) => readingMonthKey(right).localeCompare(readingMonthKey(left)));
        existingMeter.latestReading = existingMeter.readings[0];
      } else {
        existing.meters.push({ meterType, meterKey: meterKeyTyped, readings: [reading], latestReading: reading });
      }
    } else {
      apartmentMap.set(apartmentId, {
        id: apartmentId,
        apartmentId,
        apartment: apartmentNumber,
        building,
        buildingLabel,
        meters: [{ meterType, meterKey: meterKeyTyped, readings: [reading], latestReading: reading }],
      });
    }
  });

  return {
    managedBuildings,
    apartments: normalizeInitialMeterReadings(Array.from(apartmentMap.values())),
  };
}

function waterSummaryForApartments(apartments: ApartmentMeterData[], requestedMonthKey?: string | null): MonthlyWaterSummary | null {
  const allMonthKeys = apartments
    .flatMap((apt) => apt.meters)
    .flatMap((meter) => meter.readings.map((reading) => readingMonthKey(reading)))
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a));
  const monthKey = requestedMonthKey || allMonthKeys[0];
  if (!monthKey) return null;

  let cold = 0;
  let hot = 0;
  let readingsCount = 0;
  const submittedApartmentIds = new Set<string>();

  apartments.forEach((apt) => {
    let apartmentSubmitted = false;
    apt.meters.forEach((meter) => {
      if (isElectricityMeter(meter)) return;
      meter.readings.forEach((reading) => {
        if (readingMonthKey(reading) !== monthKey) return;
        readingsCount += 1;
        apartmentSubmitted = true;
        const value = readingConsumptionNumber(reading);
        if (isHotWaterMeter(meter)) {
          hot += value;
        } else {
          cold += value;
        }
      });
    });
    if (apartmentSubmitted) submittedApartmentIds.add(apt.apartmentId);
  });

  if (readingsCount === 0) return null;

  return {
    monthKey,
    label: monthLabelFromKey(monthKey),
    cold: Number(cold.toFixed(3)),
    hot: Number(hot.toFixed(3)),
    total: Number((cold + hot).toFixed(3)),
    readingsCount,
    submittedApartmentCount: submittedApartmentIds.size,
  };
}

function waterSummariesForApartments(apartments: ApartmentMeterData[]) {
  const monthKeys = Array.from(new Set(
    apartments
      .flatMap((apt) => apt.meters)
      .flatMap((meter) => meter.readings.map((reading) => readingMonthKey(reading)).filter(Boolean)),
  )).sort((a, b) => b.localeCompare(a));

  return monthKeys
    .map((monthKey) => waterSummaryForApartments(apartments, monthKey))
    .filter((summary): summary is MonthlyWaterSummary => Boolean(summary));
}

function endOfMonthDate(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month) return "";
  const date = new Date(year, month, 0);
  return `${year}-${String(month).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function normalizeHistory(entries: BuildingMainMeterEntry[]) {
  return entries
    .map((entry) => {
      const currentValue = entry.currentValue === null || entry.currentValue === undefined ? null : Number(entry.currentValue);
      const legacyColdValue = entry.coldCurrentValue === null || entry.coldCurrentValue === undefined ? null : Number(entry.coldCurrentValue);
      const legacyHotValue = entry.hotCurrentValue === null || entry.hotCurrentValue === undefined ? null : Number(entry.hotCurrentValue);
      const legacyTotalValue =
        legacyColdValue === null && legacyHotValue === null
          ? null
          : Number((((legacyColdValue !== null && Number.isFinite(legacyColdValue)) ? legacyColdValue : 0) + ((legacyHotValue !== null && Number.isFinite(legacyHotValue)) ? legacyHotValue : 0)).toFixed(3));

      return {
        monthKey: entry.monthKey,
        readingDate: entry.readingDate || endOfMonthDate(entry.monthKey),
        currentValue: currentValue ?? legacyTotalValue,
      };
    })
    .filter((entry) =>
      /^\d{4}-\d{2}$/.test(entry.monthKey)
      && entry.currentValue !== null
      && Number.isFinite(entry.currentValue),
    )
    .sort((left, right) => left.monthKey.localeCompare(right.monthKey));
}

function buildRows(summaries: MonthlyWaterSummary[], entries: BuildingMainMeterEntry[]) {
  const summaryMap = new Map(summaries.map((summary) => [summary.monthKey, summary]));
  const monthKeys = Array.from(new Set([...summaries.map((summary) => summary.monthKey), ...entries.map((entry) => entry.monthKey)]))
    .sort((left, right) => right.localeCompare(left));
  const normalizedEntries = normalizeHistory(entries);
  const calculatedEntries = new Map<string, {
    currentValue: number | null;
    previousValue: number | null;
    consumption: number;
    readingDate: string;
  }>();

  normalizedEntries.forEach((entry, index) => {
    const previousEntry = index > 0 ? normalizedEntries[index - 1] : null;
    const previousValue = previousEntry?.currentValue ?? null;
    const consumption =
      entry.currentValue === null || previousValue === null ? 0 : consumptionValue(entry.currentValue, previousValue);
    calculatedEntries.set(entry.monthKey, {
      currentValue: entry.currentValue,
      previousValue,
      consumption,
      readingDate: entry.readingDate,
    });
  });

  return monthKeys.map<BuildingHistoryRow>((monthKey) => {
    const summary = summaryMap.get(monthKey);
    const main = calculatedEntries.get(monthKey);
    const residentCold = summary?.cold ?? 0;
    const residentHot = summary?.hot ?? 0;
    const residentTotal = summary?.total ?? 0;
    const coldMainConsumption = main?.consumption ?? 0;
    const hotMainConsumption = 0;
    const mainConsumptionTotal = Number((coldMainConsumption + hotMainConsumption).toFixed(3));
    const coldDifference = Number((coldMainConsumption - residentCold).toFixed(3));
    const hotDifference = Number((hotMainConsumption - residentHot).toFixed(3));
    return {
      monthKey,
      label: monthLabelFromKey(monthKey),
      year: monthKey.split("-")[0] || "",
      coldMainCurrentValue: main?.currentValue ?? null,
      coldMainPreviousValue: main?.previousValue ?? null,
      coldMainConsumption,
      hotMainCurrentValue: null,
      hotMainPreviousValue: null,
      hotMainConsumption,
      mainConsumptionTotal,
      residentCold,
      residentHot,
      residentTotal,
      coldDifference,
      hotDifference,
      differenceTotal: Number((mainConsumptionTotal - residentTotal).toFixed(3)),
      readingDate: main?.readingDate ?? null,
    };
  });
}

function safeStorageKey(buildingId: string) {
  return `domera:building-main-meter:v1:${buildingId}`;
}

function selectedBuildingStorageKey() {
  return "domera:building-main-meter:selected-building";
}

function chartMaxForRows(rows: BuildingHistoryRow[]) {
  return Math.max(
    1,
    ...rows.flatMap((row) => [row.mainConsumptionTotal, row.residentTotal, Math.abs(row.differenceTotal)]).filter((value) => value > 0),
  );
}

function formatMaybeCubic(value: number | null) {
  return value === null ? "—" : formatCubic(value);
}

function entryTotalValue(entry: BuildingMainMeterEntry | null | undefined) {
  if (!entry) return null;
  return entry.currentValue == null ? null : Number(entry.currentValue.toFixed(3));
}

function parseReadingInput(value: string) {
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeBuildingMainMeterEntries(value: unknown): BuildingMainMeterEntry[] {
  if (!Array.isArray(value)) return [];

  const entries: BuildingMainMeterEntry[] = [];
  value.forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const item = entry as UnknownRecord;
    const monthKey = text(item.monthKey);
    const readingDate = text(item.readingDate);
    const currentValue = parseReadingInput(String(item.currentValue ?? ""));
    const coldCurrentValue = parseReadingInput(String(item.coldCurrentValue ?? ""));
    const hotCurrentValue = parseReadingInput(String(item.hotCurrentValue ?? ""));
    const legacyTotalValue =
      coldCurrentValue === null && hotCurrentValue === null
        ? null
        : Number(((coldCurrentValue ?? 0) + (hotCurrentValue ?? 0)).toFixed(3));

    if (!/^\d{4}-\d{2}$/.test(monthKey)) return;
    if (currentValue === null && legacyTotalValue === null) return;

    entries.push({
      monthKey,
      readingDate,
      currentValue: currentValue ?? legacyTotalValue,
    });
  });

  return normalizeHistory(entries);
}

export default function BuildingPrimaryMeterPage({ initialData, canManageReadings = true }: Props) {
  const t = useTranslations("meterread");
  const session = useAuthSession();
  const notify = useNotifications();
  const tr = React.useCallback((key: string, fallback: string) => {
    const value = t(key);
    return value === `meterread.${key}` ? fallback : value;
  }, [t]);
  const initialState = React.useMemo(() => initialData ? buildManagementMeterReadingsState(initialData) : { apartments: [], managedBuildings: [] }, [initialData]);
  const [selectedBuildingId, setSelectedBuildingId] = React.useState("");
  const [buildingEntries, setBuildingEntries] = React.useState<BuildingMainMeterEntry[]>([]);
  const [buildingEntryOverrides, setBuildingEntryOverrides] = React.useState<Record<string, BuildingMainMeterEntry[]>>({});
  const [monthKey, setMonthKey] = React.useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [readingDate, setReadingDate] = React.useState(() => endOfMonthDate(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`));
  const [coldCurrentValueInput, setColdCurrentValueInput] = React.useState("");
  const [storageReady, setStorageReady] = React.useState(false);
  const [mainMeterSaving, setMainMeterSaving] = React.useState(false);
  const [mainMeterDeleting, setMainMeterDeleting] = React.useState(false);
  const [deleteMainMeterOpen, setDeleteMainMeterOpen] = React.useState(false);
  const [historyTab, setHistoryTab] = React.useState<"building" | "apartments">("building");
  const [expandedMonthKeys, setExpandedMonthKeys] = React.useState<Set<string>>(() => new Set());
  const [visibleCombinedSeries, setVisibleCombinedSeries] = React.useState<Record<CombinedChartSeriesKey, boolean>>({
    house: true,
    apartmentsTotal: true,
    apartmentsCold: true,
    apartmentsHot: true,
    submittedApartments: true,
  });

  const buildings = initialState.managedBuildings;
  const selectedBuilding = buildings.find((building) => building.id === selectedBuildingId) ?? null;
  const selectedMonthMainEntry = React.useMemo(
    () => normalizeHistory(buildingEntries).find((entry) => entry.monthKey === monthKey) ?? null,
    [buildingEntries, monthKey],
  );
  const previousMonthMainEntry = React.useMemo(
    () => {
      const previousEntries = normalizeHistory(buildingEntries).filter((entry) => entry.monthKey < monthKey);
      return previousEntries[previousEntries.length - 1] ?? null;
    },
    [buildingEntries, monthKey],
  );
  const selectedMonthMainValue = entryTotalValue(selectedMonthMainEntry);
  const previousMonthMainValue = entryTotalValue(previousMonthMainEntry);

  React.useEffect(() => {
    if (buildings.length === 0) return;

    if (selectedBuildingId && buildings.some((building) => building.id === selectedBuildingId)) {
      return;
    }

    try {
      const storedBuildingId = window.localStorage.getItem(selectedBuildingStorageKey());
      if (storedBuildingId && buildings.some((building) => building.id === storedBuildingId)) {
        setSelectedBuildingId(storedBuildingId);
        return;
      }
    } catch {
      // Ignore storage read issues and fall back to the first building.
    }

    setSelectedBuildingId(buildings[0].id);
  }, [buildings, selectedBuildingId]);

  const handleMonthChange = React.useCallback((value: string) => {
    setMonthKey(value);
    setReadingDate(endOfMonthDate(value));
  }, []);

  React.useEffect(() => {
    if (!selectedBuildingId) return;
    try {
      window.localStorage.setItem(selectedBuildingStorageKey(), selectedBuildingId);
    } catch {
      // Ignore storage write issues.
    }
  }, [selectedBuildingId]);

  React.useEffect(() => {
    if (!selectedBuildingId) return;
    setStorageReady(false);
    const entriesFromBuilding = buildingEntryOverrides[selectedBuildingId] ?? selectedBuilding?.buildingMainMeterEntries ?? [];
    if (entriesFromBuilding.length > 0) {
      setBuildingEntries(entriesFromBuilding);
      setStorageReady(true);
      return;
    }

    try {
      const raw = window.localStorage.getItem(safeStorageKey(selectedBuildingId));
      const nextEntries = raw ? JSON.parse(raw) as BuildingMainMeterEntry[] : [];
      setBuildingEntries(normalizeHistory(nextEntries));
    } catch {
      setBuildingEntries([]);
    } finally {
      setStorageReady(true);
    }
  }, [buildingEntryOverrides, selectedBuilding?.buildingMainMeterEntries, selectedBuildingId]);

  React.useEffect(() => {
    setColdCurrentValueInput(selectedMonthMainValue === null ? "" : String(selectedMonthMainValue));
    setReadingDate(selectedMonthMainEntry?.readingDate || endOfMonthDate(monthKey));
  }, [monthKey, selectedMonthMainEntry?.readingDate, selectedMonthMainValue]);

  const buildingApartments = React.useMemo(
    () => initialState.apartments.filter((apartment) => apartment.building === selectedBuildingId),
    [initialState.apartments, selectedBuildingId],
  );
  const buildingSummaryRows = React.useMemo(
    () => waterSummariesForApartments(buildingApartments),
    [buildingApartments],
  );
  const historyRows = React.useMemo(
    () => buildRows(buildingSummaryRows, buildingEntries),
    [buildingEntries, buildingSummaryRows],
  );
  const [reportMonthKey, setReportMonthKey] = React.useState(() => historyRows[0]?.monthKey ?? monthKey);
  React.useEffect(() => {
    if (historyRows.length > 0 && !historyRows.some((row) => row.monthKey === reportMonthKey)) {
      setReportMonthKey(historyRows[0].monthKey);
    }
  }, [historyRows, reportMonthKey]);
  const yearlyTotals = React.useMemo(() => {
    const totals = new Map<string, number>();
    historyRows.forEach((row) => {
      totals.set(row.year, Number(((totals.get(row.year) ?? 0) + row.differenceTotal).toFixed(3)));
    });
    return Array.from(totals.entries()).sort((left, right) => right[0].localeCompare(left[0]));
  }, [historyRows]);
  const latestRow = historyRows.find((row) => row.monthKey === reportMonthKey) ?? historyRows[0] ?? null;
  const coldEnabled = Boolean(selectedBuilding);
  const [yearStr, monthStr] = monthKey.split("-");
  const currentPeriodLabel = yearStr && monthStr ? `${monthStr}.${yearStr}` : monthKey;
  const totalMainCurrentValue =
    latestRow && (latestRow.coldMainCurrentValue !== null || latestRow.hotMainCurrentValue !== null)
      ? Number(((latestRow.coldMainCurrentValue ?? 0) + (latestRow.hotMainCurrentValue ?? 0)).toFixed(3))
      : null;
  const totalMainPreviousValue =
    latestRow && (latestRow.coldMainPreviousValue !== null || latestRow.hotMainPreviousValue !== null)
      ? Number(((latestRow.coldMainPreviousValue ?? 0) + (latestRow.hotMainPreviousValue ?? 0)).toFixed(3))
      : null;
  const totalMainConsumption = latestRow?.mainConsumptionTotal ?? 0;
  const totalResidentValue = latestRow?.residentTotal ?? 0;
  const totalDifferenceValue = latestRow?.differenceTotal ?? 0;
  const toggleMonthExpanded = React.useCallback((targetMonthKey: string) => {
    setExpandedMonthKeys((current) => {
      const next = new Set(current);
      if (next.has(targetMonthKey)) {
        next.delete(targetMonthKey);
      } else {
        next.add(targetMonthKey);
      }
      return next;
    });
  }, []);

  const toggleCombinedSeries = React.useCallback((key: CombinedChartSeriesKey) => {
    setVisibleCombinedSeries((current) => ({ ...current, [key]: !current[key] }));
  }, []);

  const saveMainReading = React.useCallback(async () => {
    if (!selectedBuildingId || !canManageReadings) return;
    const coldCurrentValue = coldEnabled ? parseReadingInput(coldCurrentValueInput) : null;
    if (coldEnabled && coldCurrentValue === null) return;
    const nextEntries = normalizeHistory([
      ...buildingEntries.filter((entry) => entry.monthKey !== monthKey),
      {
        monthKey,
        readingDate: readingDate || endOfMonthDate(monthKey),
        currentValue: coldCurrentValue,
      },
    ]);
    try {
      setMainMeterSaving(true);
      await apiFetch(`/buildings/${encodeURIComponent(selectedBuildingId)}`, {
        method: "PATCH",
        body: JSON.stringify({ buildingMainMeterEntries: nextEntries }),
      });
      setBuildingEntries(nextEntries);
      setBuildingEntryOverrides((current) => ({ ...current, [selectedBuildingId]: nextEntries }));
      window.localStorage.setItem(safeStorageKey(selectedBuildingId), JSON.stringify(nextEntries));
      setColdCurrentValueInput("");
      notify.success(t("notifyMetersSaved"));
      if (session.userId) {
        void apiFetch("/notifications", {
          method: "POST",
          redirectOnAuthError: false,
          body: JSON.stringify({
            userId: session.userId,
            type: "meter-reading",
            channel: t("buildingMainMeterEyebrow"),
            title: t("notifyMetersSaved"),
            description: `${selectedBuilding?.label ?? t("buildingMainMeterTitle")} · ${currentPeriodLabel}`,
            actionHref: ROUTES.meterReadingsBuilding,
            actionLabel: t("openBuildingMainMeter"),
          }),
        })
          .then(() => notifyMeterReadingsChanged())
          .catch((error) => {
            console.error("Failed to create building main meter notification", error);
          });
      } else {
        notifyMeterReadingsChanged();
      }
    } catch (error) {
      console.error("Failed to save building main meter reading", error);
      notify.error(t("notifySaveError"));
    } finally {
      setMainMeterSaving(false);
    }
  }, [buildingEntries, canManageReadings, coldCurrentValueInput, coldEnabled, currentPeriodLabel, monthKey, notify, readingDate, selectedBuilding?.label, selectedBuildingId, session.userId, t]);

  const deleteMainReading = React.useCallback(async () => {
    if (!selectedBuildingId || !canManageReadings || !selectedMonthMainEntry) return;
    const nextEntries = normalizeHistory(buildingEntries.filter((entry) => entry.monthKey !== monthKey));

    try {
      setMainMeterDeleting(true);
      await apiFetch(`/buildings/${encodeURIComponent(selectedBuildingId)}`, {
        method: "PATCH",
        body: JSON.stringify({ buildingMainMeterEntries: nextEntries }),
      });
      setBuildingEntries(nextEntries);
      setBuildingEntryOverrides((current) => ({ ...current, [selectedBuildingId]: nextEntries }));
      window.localStorage.setItem(safeStorageKey(selectedBuildingId), JSON.stringify(nextEntries));
      setColdCurrentValueInput("");
      setReadingDate(endOfMonthDate(monthKey));
      notify.success(t("notifyDeletedReadings", { monthKey }));
      if (session.userId) {
        void apiFetch("/notifications", {
          method: "POST",
          redirectOnAuthError: false,
          body: JSON.stringify({
            userId: session.userId,
            type: "meter-reading",
            channel: t("buildingMainMeterEyebrow"),
            title: t("notifyDeletedReadings", { monthKey }),
            description: `${selectedBuilding?.label ?? t("buildingMainMeterTitle")} · ${currentPeriodLabel}`,
            actionHref: ROUTES.meterReadingsBuilding,
            actionLabel: t("openBuildingMainMeter"),
          }),
        })
          .then(() => notifyMeterReadingsChanged())
          .catch((error) => {
            console.error("Failed to create building main meter delete notification", error);
          });
      } else {
        notifyMeterReadingsChanged();
      }
    } catch (error) {
      console.error("Failed to delete building main meter reading", error);
      notify.error(t("notifyDeleteError"));
    } finally {
      setMainMeterDeleting(false);
    }
  }, [buildingEntries, canManageReadings, currentPeriodLabel, monthKey, notify, selectedBuilding?.label, selectedBuildingId, selectedMonthMainEntry, session.userId, t]);

  const chartRows = historyRows.slice(0, 12).reverse();
  const width = 960;
  const height = 360;
  const padLeft = 72;
  const padRight = 76;
  const padTop = 24;
  const padBottom = 54;
  const chartMax = Math.max(
    1,
    ...chartRows.flatMap((row) => [
      row.mainConsumptionTotal,
      row.residentTotal,
      Math.abs(row.differenceTotal),
    ]).filter((value) => value > 0),
  );
  const xFor = (index: number) => {
    if (chartRows.length <= 1) return width / 2;
    return padLeft + (index * (width - padLeft - padRight)) / (chartRows.length - 1);
  };
  const yFor = (value: number) => height - padBottom - (value / chartMax) * (height - padTop - padBottom);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
    ratio,
    value: chartMax * ratio,
    y: height - padBottom - ratio * (height - padTop - padBottom),
  }));
  const mainPoints = chartRows
    .map((row, index) => `${xFor(index)},${yFor(row.mainConsumptionTotal)}`)
    .join(" ");
  const residentPoints = chartRows
    .map((row, index) => `${xFor(index)},${yFor(row.residentTotal)}`)
    .join(" ");
  const residentStatsRows = historyRows.slice(0, 12).reverse();
  const residentSeriesValues = residentStatsRows
    .flatMap((row) => [row.residentCold, row.residentHot])
    .filter((value) => value > 0)
    .sort((left, right) => right - left);
  const residentLargestValue = residentSeriesValues[0] ?? 0;
  const residentSecondLargestValue = residentSeriesValues[1] ?? residentLargestValue;
  const residentHasOutlier = residentLargestValue > 0 && residentSecondLargestValue > 0 && residentLargestValue >= residentSecondLargestValue * 4;
  const residentStatsMax = Math.max(
    1,
    residentHasOutlier ? residentSecondLargestValue * 1.2 : residentLargestValue,
  );
  const residentStatsXFor = (index: number) => {
    if (residentStatsRows.length <= 1) return width / 2;
    return padLeft + (index * (width - padLeft - padRight)) / (residentStatsRows.length - 1);
  };
  const residentStatsChartValue = (value: number) => Math.min(value, residentStatsMax);
  const residentStatsYFor = (value: number) => height - padBottom - (residentStatsChartValue(value) / residentStatsMax) * (height - padTop - padBottom);
  const residentStatsTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
    ratio,
    value: residentStatsMax * ratio,
    y: height - padBottom - ratio * (height - padTop - padBottom),
  }));
  const residentColdPoints = residentStatsRows
    .map((row, index) => `${residentStatsXFor(index)},${residentStatsYFor(row.residentCold)}`)
    .join(" ");
  const residentHotPoints = residentStatsRows
    .map((row, index) => `${residentStatsXFor(index)},${residentStatsYFor(row.residentHot)}`)
    .join(" ");
  const submittedApartmentsByMonth = new Map(buildingSummaryRows.map((summary) => [summary.monthKey, summary.submittedApartmentCount]));
  const combinedChartRows = historyRows.slice(0, 12).reverse().map((row) => ({
    ...row,
    submittedApartmentCount: submittedApartmentsByMonth.get(row.monthKey) ?? 0,
  }));
  const combinedConsumptionValues = combinedChartRows
    .flatMap((row) => [
      visibleCombinedSeries.house ? row.mainConsumptionTotal : 0,
      visibleCombinedSeries.apartmentsTotal ? row.residentTotal : 0,
      visibleCombinedSeries.apartmentsCold ? row.residentCold : 0,
      visibleCombinedSeries.apartmentsHot ? row.residentHot : 0,
    ])
    .filter((value) => value > 0)
    .sort((left, right) => right - left);
  const combinedLargestValue = combinedConsumptionValues[0] ?? 0;
  const combinedSecondLargestValue = combinedConsumptionValues[1] ?? combinedLargestValue;
  const combinedHasOutlier =
    combinedLargestValue > 0 &&
    combinedSecondLargestValue > 0 &&
    combinedLargestValue >= combinedSecondLargestValue * 4;
  const combinedChartMax = Math.max(
    1,
    combinedHasOutlier ? combinedSecondLargestValue * 1.2 : combinedLargestValue,
  );
  const submittedApartmentsMax = Math.max(
    1,
    visibleCombinedSeries.submittedApartments ? selectedBuilding?.apartmentCount ?? 0 : 0,
    ...combinedChartRows.map((row) => visibleCombinedSeries.submittedApartments ? row.submittedApartmentCount : 0),
  );
  const combinedChartValue = (value: number) => Math.min(value, combinedChartMax);
  const combinedYFor = (value: number) => height - padBottom - (combinedChartValue(value) / combinedChartMax) * (height - padTop - padBottom);
  const submittedApartmentsYFor = (value: number) => height - padBottom - (Math.min(value, submittedApartmentsMax) / submittedApartmentsMax) * (height - padTop - padBottom);
  const combinedTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
    ratio,
    value: combinedChartMax * ratio,
    y: height - padBottom - ratio * (height - padTop - padBottom),
  }));
  const submittedApartmentTicks = [0, 0.5, 1].map((ratio) => ({
    ratio,
    value: submittedApartmentsMax * ratio,
    y: height - padBottom - ratio * (height - padTop - padBottom),
  }));
  const housePoints = combinedChartRows.map((row, index) => `${xFor(index)},${combinedYFor(row.mainConsumptionTotal)}`).join(" ");
  const totalApartmentsPoints = combinedChartRows.map((row, index) => `${xFor(index)},${combinedYFor(row.residentTotal)}`).join(" ");
  const coldApartmentsPoints = combinedChartRows.map((row, index) => `${xFor(index)},${combinedYFor(row.residentCold)}`).join(" ");
  const hotApartmentsPoints = combinedChartRows.map((row, index) => `${xFor(index)},${combinedYFor(row.residentHot)}`).join(" ");
  const latestCombinedChartRow = combinedChartRows[combinedChartRows.length - 1] ?? null;
  const latestCombinedChartX = combinedChartRows.length > 0 ? xFor(combinedChartRows.length - 1) : 0;
  const combinedLegendItems: Array<{
    key: CombinedChartSeriesKey;
    label: string;
    dotClassName: string;
    activeClassName: string;
  }> = [
    {
      key: "house",
      label: t("buildingMainMeterTitle"),
      dotClassName: "bg-sky-500",
      activeClassName: "bg-sky-50 text-sky-700",
    },
    {
      key: "apartmentsTotal",
      label: t("buildingMainMeterSeriesApartmentsTotal"),
      dotClassName: "bg-emerald-500",
      activeClassName: "bg-emerald-50 text-emerald-700",
    },
    {
      key: "apartmentsCold",
      label: tr("buildingMainMeterSeriesApartmentsCold", "Квартиры ХВ"),
      dotClassName: "bg-blue-700",
      activeClassName: "bg-blue-50 text-blue-700",
    },
    {
      key: "apartmentsHot",
      label: tr("buildingMainMeterSeriesApartmentsHot", "Квартиры ГВ"),
      dotClassName: "bg-pink-600",
      activeClassName: "bg-pink-50 text-pink-700",
    },
    {
      key: "submittedApartments",
      label: tr("buildingMainMeterSeriesSubmittedApartments", "Квартиры с показаниями"),
      dotClassName: "bg-violet-600",
      activeClassName: "bg-violet-50 text-violet-700",
    },
  ];
  const renderWaterPair = (coldValue: number | null, hotValue: number | null) => (
    <div className="inline-grid min-w-[7.5rem] gap-1 text-right tabular-nums">
      <div className="flex items-center justify-end gap-2 text-blue-700">
        <span className="text-[11px] font-semibold uppercase text-blue-500">{t("coldWaterShort")}</span>
        <span>{formatMaybeCubic(coldValue)}</span>
      </div>
      <div className="flex items-center justify-end gap-2 text-rose-700">
        <span className="text-[11px] font-semibold uppercase text-rose-500">{t("hotWaterShort")}</span>
        <span>{formatMaybeCubic(hotValue)}</span>
      </div>
    </div>
  );
  const apartmentBreakdownForMonth = (targetMonthKey: string) => buildingApartments
    .map((apartment) => {
      const coldMeter = apartment.meters.find((meter) => meter.meterKey === "coldmeterwater" || (!isHotWaterMeter(meter) && !isElectricityMeter(meter)));
      const hotMeter = apartment.meters.find((meter) => meter.meterKey === "hotmeterwater" || isHotWaterMeter(meter));
      const coldReading = latestReadingForMonth(coldMeter, targetMonthKey);
      const hotReading = latestReadingForMonth(hotMeter, targetMonthKey);
      const coldConsumption = coldReading ? readingConsumptionNumber(coldReading) : null;
      const hotConsumption = hotReading ? readingConsumptionNumber(hotReading) : null;
      const totalConsumption = coldConsumption !== null || hotConsumption !== null
        ? Number(((coldConsumption ?? 0) + (hotConsumption ?? 0)).toFixed(3))
        : null;

      return {
        apartmentId: apartment.apartmentId,
        apartment: apartment.apartment,
        coldCurrentValue: coldReading ? parseReadingInput(coldReading.currentValue) : null,
        hotCurrentValue: hotReading ? parseReadingInput(hotReading.currentValue) : null,
        coldConsumption,
        hotConsumption,
        totalConsumption,
        hasReading: Boolean(coldReading || hotReading),
      };
    })
    .sort((left, right) => left.apartment.localeCompare(right.apartment, undefined, { numeric: true, sensitivity: "base" }));

  return (
    <>
      <div className="mx-auto max-w-6xl space-y-3 overflow-hidden px-1 sm:space-y-5 sm:px-2">
        <div className="px-2 sm:px-3">
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 pt-3">
            <div className="flex min-w-0 flex-col items-start gap-1">
              <div className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">
                {t("buildingStats")}
              </div>
              {selectedBuilding ? (
                <div className="min-w-0 px-2">
                  <div className="truncate text-sm font-semibold text-slate-900">{selectedBuilding.label}</div>
                  <div className="text-xs text-slate-500">{selectedBuilding.apartmentCount} {t("apts")}</div>
                </div>
              ) : null}
            </div>
            <Link
              href={ROUTES.meterReadings}
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              {t("backToMeterReadings")}
            </Link>
          </div>
        </div>

        <div className="grid min-w-0 max-w-full grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-2">
          <div className="contents">
          <div className="order-5 max-w-full overflow-hidden border-t border-slate-200/80 px-2 pt-5 sm:px-3 sm:pt-6 lg:col-span-2">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{t("buildingStats")}</div>
                <div className="mt-1 text-lg font-semibold text-slate-950">{t("buildingMainMeterTitle")}</div>
                <div className="mt-1 text-sm text-slate-500">{tr("buildingMainMeterCombinedChartDescription", "Расход домового счётчика и показания жильцов по месяцам")}</div>
                <div className="mt-2 text-xs font-medium text-slate-400">
                  {tr("buildingMainMeterCombinedChartUnits", "Левая ось: m3. Правая ось: квартиры.")}
                </div>
              </div>
              <div className="grid w-full min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:w-auto xl:max-w-xl">
                {combinedLegendItems.map((item) => {
                  const isVisible = visibleCombinedSeries[item.key];
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => toggleCombinedSeries(item.key)}
                      aria-pressed={isVisible}
                      className={`inline-flex min-w-0 items-center gap-2 rounded-full px-3 py-1.5 text-left text-xs font-semibold transition ${
                        isVisible ? item.activeClassName : "bg-slate-100 text-slate-400 opacity-70"
                      }`}
                    >
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${isVisible ? item.dotClassName : "bg-slate-300"}`} />
                      <span className="min-w-0 whitespace-normal break-words">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {combinedChartRows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                {t("buildingMainMeterEmpty")}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-100 bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] p-2 sm:rounded-2xl sm:p-3">
                <svg viewBox={`0 0 ${width} ${height}`} className="h-64 w-full min-w-[680px] overflow-visible sm:h-80 sm:min-w-[760px]">
                  <line x1={padLeft} y1={height - padBottom} x2={width - padRight} y2={height - padBottom} stroke="#cbd5e1" strokeWidth="1" />
                  <line x1={padLeft} y1={padTop} x2={padLeft} y2={height - padBottom} stroke="#cbd5e1" strokeWidth="1" />
                  {visibleCombinedSeries.submittedApartments ? (
                    <line x1={width - padRight} y1={padTop} x2={width - padRight} y2={height - padBottom} stroke="#ddd6fe" strokeWidth="1" />
                  ) : null}
                  {combinedTicks.map((tick) => (
                    <g key={tick.ratio}>
                      <line x1={padLeft} y1={tick.y} x2={width - padRight} y2={tick.y} stroke="#e2e8f0" strokeWidth="1" />
                      <text x={padLeft - 10} y={tick.y + 4} textAnchor="end" className="fill-slate-500 text-[11px] font-semibold">
                        {tick.ratio === 0 ? "0" : tick.value.toFixed(0)}
                      </text>
                    </g>
                  ))}
                  {visibleCombinedSeries.submittedApartments ? submittedApartmentTicks.map((tick) => (
                    <text key={`submitted-${tick.ratio}`} x={width - padRight + 10} y={tick.y + 4} textAnchor="start" className="fill-violet-600 text-[11px] font-semibold">
                      {tick.value.toFixed(0)}
                    </text>
                  )) : null}
                  <text x={padLeft} y={padTop - 8} textAnchor="start" className="fill-slate-400 text-[10px] font-semibold">
                    m3
                  </text>
                  {visibleCombinedSeries.submittedApartments ? (
                    <text x={width - padRight} y={padTop - 8} textAnchor="end" className="fill-violet-500 text-[10px] font-semibold">
                      {t("buildingMainMeterSubmittedAxis")}
                    </text>
                  ) : null}
                  {combinedChartRows.map((row, index) => (
                    <text key={`${row.monthKey}-label`} x={xFor(index)} y={height - 16} textAnchor="middle" className="fill-slate-500 text-[11px] font-semibold">
                      {row.label}
                    </text>
                  ))}
                  {visibleCombinedSeries.house ? (
                    <polyline points={housePoints} fill="none" stroke="#0ea5e9" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  ) : null}
                  {visibleCombinedSeries.apartmentsTotal ? (
                    <polyline points={totalApartmentsPoints} fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  ) : null}
                  {visibleCombinedSeries.apartmentsCold ? (
                    <polyline points={coldApartmentsPoints} fill="none" stroke="#1d4ed8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  ) : null}
                  {visibleCombinedSeries.apartmentsHot ? (
                    <polyline points={hotApartmentsPoints} fill="none" stroke="#db2777" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  ) : null}
                  {combinedChartRows.map((row, index) => (
                    <g key={`${row.monthKey}-dots`}>
                      {visibleCombinedSeries.submittedApartments ? (
                        <>
                          <rect
                            x={xFor(index) - 9}
                            y={submittedApartmentsYFor(row.submittedApartmentCount)}
                            width="18"
                            height={height - padBottom - submittedApartmentsYFor(row.submittedApartmentCount)}
                            rx="6"
                            fill="#7c3aed"
                            opacity="0.22"
                          />
                          <text x={xFor(index)} y={submittedApartmentsYFor(row.submittedApartmentCount) - 12} textAnchor="middle" className="fill-violet-700 text-[10px] font-semibold">
                            {row.submittedApartmentCount}
                          </text>
                        </>
                      ) : null}
                      {visibleCombinedSeries.house ? <circle cx={xFor(index)} cy={combinedYFor(row.mainConsumptionTotal)} r="4.5" fill="#0ea5e9" /> : null}
                      {visibleCombinedSeries.apartmentsTotal ? <circle cx={xFor(index)} cy={combinedYFor(row.residentTotal)} r="4.5" fill="#10b981" /> : null}
                      {visibleCombinedSeries.apartmentsCold ? <circle cx={xFor(index)} cy={combinedYFor(row.residentCold)} r="4.5" fill="#1d4ed8" /> : null}
                      {visibleCombinedSeries.apartmentsHot ? <circle cx={xFor(index)} cy={combinedYFor(row.residentHot)} r="4.5" fill="#db2777" /> : null}
                    </g>
                  ))}
                  {latestCombinedChartRow ? (
                    <>
                      {visibleCombinedSeries.house ? (
                        <text x={latestCombinedChartX + 12} y={combinedYFor(latestCombinedChartRow.mainConsumptionTotal) - 4} className="fill-sky-700 text-[10px] font-semibold">
                          {formatCubic(latestCombinedChartRow.mainConsumptionTotal)}
                        </text>
                      ) : null}
                      {visibleCombinedSeries.apartmentsTotal ? (
                        <text x={latestCombinedChartX + 12} y={combinedYFor(latestCombinedChartRow.residentTotal) - 18} className="fill-emerald-700 text-[10px] font-semibold">
                          {formatCubic(latestCombinedChartRow.residentTotal)}
                        </text>
                      ) : null}
                      {visibleCombinedSeries.apartmentsCold ? (
                        <text x={latestCombinedChartX + 12} y={combinedYFor(latestCombinedChartRow.residentCold) - 4} className="fill-blue-700 text-[10px] font-semibold">
                          {formatCubic(latestCombinedChartRow.residentCold)}
                        </text>
                      ) : null}
                      {visibleCombinedSeries.apartmentsHot ? (
                        <text x={latestCombinedChartX + 12} y={combinedYFor(latestCombinedChartRow.residentHot) - 4} className="fill-pink-700 text-[10px] font-semibold">
                          {formatCubic(latestCombinedChartRow.residentHot)}
                        </text>
                      ) : null}
                    </>
                  ) : null}
                </svg>
              </div>
            )}
          </div>

          <div className="order-6 overflow-hidden border-t border-slate-200/80 pt-5 sm:pt-6 lg:col-span-2">
            <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-5">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{t("buildingMainMeterHistoryTitle")}</div>
                <div className="mt-1 break-words text-sm text-slate-500">{selectedBuilding?.label ?? "—"}</div>
              </div>
              <div className="grid w-full grid-cols-2 rounded-lg border border-slate-200 bg-slate-50 p-1 sm:inline-flex sm:w-auto sm:rounded-2xl">
                <button
                  type="button"
                  onClick={() => setHistoryTab("building")}
                  className={`rounded-md px-2 py-2 text-sm font-semibold transition sm:rounded-xl sm:px-3 ${historyTab === "building" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
                >
                  {t("buildingMainMeterTitle")}
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryTab("apartments")}
                  className={`rounded-md px-2 py-2 text-sm font-semibold transition sm:rounded-xl sm:px-3 ${historyTab === "apartments" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
                >
                  {t("residentsSubmittedTotal")}
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              {historyTab === "building" ? (
                <table className="min-w-[760px] text-sm lg:min-w-full">
                  <thead className="bg-slate-50/80 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold sm:px-5">{t("period")}</th>
                      <th className="px-3 py-3 text-right font-semibold sm:px-5">{t("currentReading")}</th>
                      <th className="px-3 py-3 text-right font-semibold sm:px-5">{t("mainMeterMonthlyConsumption")}</th>
                      <th className="px-3 py-3 text-right font-semibold sm:px-5">{t("residentsSubmittedTotal")}</th>
                      <th className="px-4 py-3 text-right font-semibold sm:px-5">{t("differenceLabel")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {historyRows.map((row) => {
                      return (
                        <React.Fragment key={row.monthKey}>
                          <tr className="hover:bg-slate-50/70">
                            <td className="px-4 py-3.5 sm:px-5">
                              <span>
                                <span className="block font-semibold text-slate-900">{row.label}</span>
                                <span className="block text-xs text-slate-500">{row.readingDate || "—"}</span>
                              </span>
                            </td>
                            <td className="px-3 py-3.5 text-right sm:px-5">
                              <span className="tabular-nums text-slate-900">
                                {formatMaybeCubic(
                                  row.coldMainCurrentValue !== null || row.hotMainCurrentValue !== null
                                    ? Number(((row.coldMainCurrentValue ?? 0) + (row.hotMainCurrentValue ?? 0)).toFixed(3))
                                    : null,
                                )}
                              </span>
                            </td>
                            <td className="px-3 py-3.5 text-right sm:px-5">
                              <span className="tabular-nums text-slate-900">{formatCubic(row.mainConsumptionTotal)}</span>
                            </td>
                            <td className="px-3 py-3.5 text-right sm:px-5">
                              <span className="tabular-nums text-blue-700">{formatCubic(row.residentTotal)}</span>
                            </td>
                            <td className="px-4 py-3.5 text-right sm:px-5">
                              <span className="tabular-nums text-amber-800">{formatCubic(row.differenceTotal)}</span>
                            </td>
                          </tr>
                        </React.Fragment>
                      );
                    })}
                    {historyRows.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-slate-500">{t("buildingMainMeterEmpty")}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              ) : (
                <table className="min-w-[640px] text-sm sm:min-w-full">
                  <thead className="bg-slate-50/80 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold sm:px-5">{t("period")}</th>
                      <th className="px-3 py-3 text-right font-semibold sm:px-5">{t("coldWaterShort")}</th>
                      <th className="px-3 py-3 text-right font-semibold sm:px-5">{t("hotWaterShort")}</th>
                      <th className="px-4 py-3 text-right font-semibold sm:px-5">{t("totalShort")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {historyRows.map((row) => {
                      const expansionKey = `apartments:${row.monthKey}`;
                      const isExpanded = expandedMonthKeys.has(expansionKey);
                      const apartmentRows = apartmentBreakdownForMonth(row.monthKey);
                      const submittedApartmentRows = apartmentRows.filter((apartment) => apartment.hasReading);

                      return (
                        <React.Fragment key={`${row.monthKey}-apartments`}>
                          <tr className="hover:bg-slate-50/70">
                            <td className="px-4 py-3.5 sm:px-5">
                              <button
                                type="button"
                                onClick={() => toggleMonthExpanded(expansionKey)}
                                className="inline-flex items-center gap-2 rounded-lg text-left transition hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-100"
                                aria-expanded={isExpanded}
                                title={isExpanded ? t("collapseApartmentReadings") : t("expandApartmentReadings")}
                              >
                                <svg className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isExpanded ? "rotate-90" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="m9 18 6-6-6-6" />
                                </svg>
                                <span>
                                  <span className="block font-semibold text-slate-900">{row.label}</span>
                                  <span className="block text-xs text-slate-500">
                                    {submittedApartmentRows.length} / {apartmentRows.length} {t("apts")}
                                  </span>
                                </span>
                              </button>
                            </td>
                            <td className="px-3 py-3.5 text-right tabular-nums text-blue-700 sm:px-5">{formatCubic(row.residentCold)}</td>
                            <td className="px-3 py-3.5 text-right tabular-nums text-rose-700 sm:px-5">{formatCubic(row.residentHot)}</td>
                            <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-slate-900 sm:px-5">{formatCubic(row.residentTotal)}</td>
                          </tr>
                          {isExpanded ? (
                            <tr className="bg-white">
                              <td colSpan={4} className="p-0">
                                <div className="overflow-x-auto border-t border-slate-100 bg-white">
                                    <table className="min-w-[560px] text-sm sm:min-w-full">
                                      <thead className="bg-slate-50/80 text-slate-600">
                                        <tr>
                                          <th colSpan={3} className="px-6 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 sm:px-8">
                                            {t("apartmentReadingsBreakdown")} · {row.label} · {submittedApartmentRows.length} / {apartmentRows.length}
                                          </th>
                                        </tr>
                                        <tr>
                                          <th className="px-6 py-2.5 text-left font-semibold sm:px-8">{t("colApartment")}</th>
                                          <th className="px-4 py-2.5 text-right font-semibold">{t("currentReading")}</th>
                                          <th className="px-6 py-2.5 text-right font-semibold sm:px-8">{t("colConsumption")}</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {apartmentRows.map((apartment) => (
                                          <tr key={`${row.monthKey}-${apartment.apartmentId}`} className="hover:bg-slate-50">
                                            <td className="px-6 py-3 font-semibold text-slate-900 sm:px-8">{apartment.apartment}</td>
                                            <td className="px-6 py-3 text-right sm:px-8">
                                              {renderWaterPair(apartment.coldCurrentValue, apartment.hotCurrentValue)}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                              {renderWaterPair(apartment.coldConsumption, apartment.hotConsumption)}
                                            </td>
                                          </tr>
                                        ))}
                                        {apartmentRows.length === 0 ? (
                                          <tr>
                                            <td colSpan={3} className="px-4 py-8 text-center text-slate-500">{t("apartmentReadingsEmpty")}</td>
                                          </tr>
                                        ) : null}
                                      </tbody>
                                    </table>
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </React.Fragment>
                      );
                    })}
                    {historyRows.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-10 text-center text-slate-500">{t("buildingMainMeterEmpty")}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          </div>

          <div className="contents">
            <div className="order-2 max-w-4xl border-b border-blue-100 bg-blue-50/35 px-3 py-5 sm:rounded-2xl sm:px-5 sm:py-6 lg:col-start-1">
              <div className="mb-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{t("mainMeterEntryTitle")}</div>
                <div className="mt-1 text-sm leading-6 text-slate-500">{t("mainMeterEntryDescription")}</div>
              </div>
              <div className="space-y-3">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">{t("mainMeterMonthLabel")}</span>
                <input
                  type="month"
                  value={monthKey}
                  onChange={(event) => handleMonthChange(event.target.value)}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">{t("mainMeterDateLabel")}</span>
                <input
                  type="date"
                  value={readingDate}
                  onChange={(event) => setReadingDate(event.target.value)}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                />
              </label>
              {coldEnabled ? (
                <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-3 sm:rounded-3xl sm:p-4">
                  <MeterReadingInput
                    variant="cold"
                    label={t("mainMeterCurrentValueLabel")}
                    previousValue={previousMonthMainValue}
                    previousPeriod={previousMonthMainEntry ? monthLabelFromKey(previousMonthMainEntry.monthKey) : undefined}
                    currentPeriod={currentPeriodLabel}
                    value={coldCurrentValueInput}
                    onChange={setColdCurrentValueInput}
                    intDigits={5}
                    decDigits={3}
                    size="compact"
                    labels={{ previous: t("previousReading"), current: t("currentReading"), serialPrefix: t("serialPrefix") }}
                  />
                </div>
              ) : null}
              {!coldEnabled ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                  {t("buildingMainMeterEmpty")}
                </div>
              ) : null}
              <Button
                type="button"
                variant="primary"
                onClick={saveMainReading}
                disabled={
                  !canManageReadings
                  || mainMeterSaving
                  || !storageReady
                  || !monthKey
                  || (coldEnabled && !coldCurrentValueInput.trim())
                }
                className="mt-2 h-12 w-full rounded-2xl text-sm font-semibold"
              >
                {mainMeterSaving ? t("saving") : t("saveMainMeterReading")}
              </Button>
              {selectedMonthMainEntry ? (
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => setDeleteMainMeterOpen(true)}
                  disabled={!canManageReadings || mainMeterSaving || mainMeterDeleting}
                  className="h-12 w-full rounded-2xl text-sm font-semibold"
                >
                  {mainMeterDeleting ? t("deletingMainMeterReading") : t("deleteMainMeterReading")}
                </Button>
              ) : null}
            </div>
          </div>

            {latestRow ? (
              <div className="order-3 max-w-4xl border-b border-slate-200/80 px-2 pb-5 pt-1 sm:px-3 sm:pb-6 lg:col-start-2">
                <div className="mb-4 flex items-end justify-between gap-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{t("currentMonthBreakdown")}</div>
                  <select
                    value={reportMonthKey}
                    onChange={(event) => setReportMonthKey(event.target.value)}
                    aria-label={t("currentMonthBreakdown")}
                    className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                  >
                    {historyRows.map((row) => (
                      <option key={row.monthKey} value={row.monthKey}>{row.label}</option>
                    ))}
                  </select>
                </div>
                <div className="mb-3 text-base font-semibold text-slate-900">{latestRow.label}</div>
                <div className="space-y-3">
                  <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 sm:rounded-2xl">
                    <div className="text-xs font-medium text-slate-500">{t("mainMeterMonthlyConsumption")}</div>
                    <div className="mt-1 text-lg font-semibold text-slate-950">{formatCubic(totalMainConsumption)}</div>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 sm:rounded-2xl">
                    <div className="text-xs font-medium text-slate-500">{t("residentsSubmittedTotal")}</div>
                    <div className="mt-1 text-lg font-semibold text-blue-700">{formatCubic(totalResidentValue)}</div>
                  </div>
                  <div className="rounded-lg border border-amber-100 bg-amber-50/80 px-4 py-3 sm:rounded-2xl">
                    <div className="text-xs font-medium text-amber-700">{t("differenceLabel")}</div>
                    <div className="mt-1 text-lg font-semibold text-amber-800">{formatCubic(totalDifferenceValue)}</div>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-white px-4 py-3 sm:rounded-2xl">
                    <div className="text-xs font-medium text-slate-500">{t("previousReading")}</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">{formatMaybeCubic(totalMainPreviousValue)}</div>
                  </div>
                </div>
              </div>
            ) : null}

            {yearlyTotals.length > 1 ? (
              <div className="order-4 max-w-4xl border-b border-slate-200/80 px-2 pb-5 pt-1 sm:px-3 sm:pb-6 lg:col-start-2">
                <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{t("yearDifferenceTotal")}</div>
                <div className="space-y-3">
                  {yearlyTotals.map(([year, total]) => (
                    <div key={year} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 sm:rounded-2xl">
                      <div className="text-sm font-medium text-slate-600">{year}</div>
                      <div className="text-base font-semibold tabular-nums text-slate-950">{formatCubic(total)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <AlertModal
        open={deleteMainMeterOpen}
        onClose={() => setDeleteMainMeterOpen(false)}
        title={t("deleteMainMeterReadingTitle", { monthKey })}
        variant="error"
        confirmLabel={t("deleteMainMeterReading")}
        cancelLabel={t("cancel")}
        onConfirm={() => void deleteMainReading()}
      >
        {t("confirmDeleteMainMeterReading", { monthKey })}
      </AlertModal>
    </>
  );
}
