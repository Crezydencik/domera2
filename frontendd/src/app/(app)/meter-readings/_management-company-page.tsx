"use client";

import React, { useState, useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
// import { useAuthSession } from "@/shared/hooks/use-auth";
import { FilterBar, useFilters, type FilterField } from "@/components/ui/filter-bar";
import { Modal } from "@/components/ui/modal";
import { AlertModal } from "@/components/ui/alert-modal";
import { SubmissionPeriodCard, type SubmissionPeriodValue } from "@/components/ui/submission-period-card";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/shared/api/client";
import { useNotifications } from "@/shared/hooks/use-notifications";
import { isApprovedBuilding } from "@/shared/lib/buildings";
import { ROUTES } from "@/shared/lib/routes";
import MeterReadingInput from "../../../components/ui/meter-reading-input";

interface MeterReadingRecord {
  id: string;
  currentValue: string;
  previousValue: string;
  consumption: string;
  submittedAt: string;
  month?: number;
  year?: number;
  isInitialReading?: boolean;
  status: "submitted" | "pending" | "verified";
}

interface MeterInfo {
  meterType: string;
  meterKey?: "coldmeterwater" | "hotmeterwater" | "electricitymeter";
  meterId?: string;
  serialNumber?: string;
  meterDigits?: number;
  readings: MeterReadingRecord[];
  latestReading: MeterReadingRecord | null;
}

interface ApartmentMeterData {
  id: string;
  apartmentId: string;
  apartment: string;
  building: string;
  buildingLabel: string;
  residentEmail?: string;
  ownerEmail?: string;
  meters: MeterInfo[];
}

interface ManagedBuildingOption {
  id: string;
  label: string;
  apartmentCount: number;
  waterEnabled?: boolean;
  electricityEnabled?: boolean;
  electricityFixedPriceEnabled?: boolean;
  electricityPricePerKwh?: number;
}

interface MonthlyWaterSummary {
  monthKey: string;
  label: string;
  cold: number;
  hot: number;
  total: number;
  readingsCount: number;
}

interface EmailDeliveryStats {
  total: number;
  success: number;
  error: number;
  last30Days?: {
    total: number;
    success: number;
    error: number;
  };
  lastSentAt?: string | null;
}

interface EmailDeliveryLogItem {
  id: string;
  status: "success" | "error";
  to: string;
  subject?: string;
  createdAt?: string | null;
  errorMessage?: string;
  deliveryKey?: string;
  apartmentId?: string;
  metadata?: Record<string, unknown>;
}

interface EmailDeliveryGroup {
  key: string;
  utility: UtilityTab;
  stage: "start" | "end" | "close";
  date: string;
  total: number;
  success: number;
  error: number;
  lastAt?: string | null;
}

type EmailDeliveryRecipientStatus = "success" | "error" | "missing";
type EmailDeliveryRecipientFilter = "all" | EmailDeliveryRecipientStatus;

interface ManualReminderResult {
  sent: number;
  failed: number;
  skippedNoEmail: number;
  skippedSubmitted: number;
  totalApartments: number;
}

type UnknownRecord = Record<string, unknown>;
type ExportFormat = "csv" | "excel" | "xml";
type UtilityTab = "water" | "electricity";

interface ManagementCompanyPageProps {
  initialCompanyId?: string;
  initialData?: MeterReadingsInitialData;
  canManageReadings?: boolean;
}

export type MeterReadingsInitialData = {
  readingsResponse: unknown | null;
  buildingsResponse: unknown | null;
  apartmentsResponse: unknown | null;
};

type ManagementMeterReadingsState = {
  apartments: ApartmentMeterData[];
  managedBuildings: ManagedBuildingOption[];
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

function formatConsumption(value: unknown) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed.toFixed(3) : "—";
}

function readingConsumption(reading: MeterReadingRecord | null | undefined) {
  if (reading?.isInitialReading) return formatConsumption(0);
  if (!reading) return "—";
  const currentValue = Number(String(reading.currentValue ?? "").replace(",", "."));
  const previousValue = Number(String(reading.previousValue ?? "").replace(",", "."));
  if (!Number.isFinite(currentValue) || !Number.isFinite(previousValue)) {
    return formatConsumption(reading.consumption);
  }
  return formatConsumption(consumptionValue(currentValue, previousValue));
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

function isHotWaterMeter(meter: MeterInfo) {
  return meter.meterKey === "hotmeterwater" || meter.meterType.toLowerCase().includes("hot");
}

function isElectricityMeter(meter: MeterInfo | undefined) {
  return Boolean(meter && (meter.meterKey === "electricitymeter" || meter.meterType.toLowerCase().includes("electric")));
}

function isWaterMeter(meter: MeterInfo | undefined) {
  return Boolean(meter && (meter.meterKey === "coldmeterwater" || meter.meterKey === "hotmeterwater" || meter.meterType.toLowerCase().includes("water")));
}

function meterMatchesTab(meter: MeterInfo, tab: UtilityTab) {
  return tab === "water" ? isWaterMeter(meter) : isElectricityMeter(meter);
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

function monthLabelFromKey(monthKey: string) {
  const [year, month] = monthKey.split("-");
  return year && month ? `${month}.${year}` : monthKey;
}

function formatPeriodButtonDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()}`;
}

function currentMonthPeriodDate(value: string) {
  const stored = new Date(value);
  if (Number.isNaN(stored.getTime())) return value;
  const today = new Date();
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const day = Math.min(Math.max(stored.getDate(), 1), lastDay);
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function periodButtonLabel(value?: SubmissionPeriodValue | null) {
  if (!value?.startDate || !value?.endDate) return "";
  const startDate = value.monthly ? currentMonthPeriodDate(value.startDate) : value.startDate;
  const endDate = value.monthly ? currentMonthPeriodDate(value.endDate) : value.endDate;
  return `${formatPeriodButtonDate(startDate)} - ${formatPeriodButtonDate(endDate)}`;
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

  apartments.forEach((apt) => {
    apt.meters.forEach((meter) => {
      if (isElectricityMeter(meter)) return;
      meter.readings.forEach((reading) => {
        if (readingMonthKey(reading) !== monthKey) return;
        readingsCount += 1;
        const value = readingConsumptionNumber(reading);
        if (isHotWaterMeter(meter)) {
          hot += value;
        } else {
          cold += value;
        }
      });
    });
  });

  if (readingsCount === 0) return null;

  return {
    monthKey,
    label: monthLabelFromKey(monthKey),
    cold: Number(cold.toFixed(3)),
    hot: Number(hot.toFixed(3)),
    total: Number((cold + hot).toFixed(3)),
    readingsCount,
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

function readingMonthKey(reading: MeterReadingRecord | null | undefined) {
  if (!reading) return "";

  if (reading.month && reading.year) {
    return `${reading.year}-${String(reading.month).padStart(2, "0")}`;
  }

  return monthKeyFromDateString(reading.submittedAt);
}

function monthKeyFromDateString(raw: string | null | undefined) {
  if (!raw || raw === "—" || raw === "вЂ”") return "";

  const isoMatch = /^(\d{4})-(\d{2})/.exec(raw);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}`;

  const localMatch = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(raw);
  if (localMatch) return `${localMatch[3]}-${localMatch[2]}`;

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function readingMonthLabel(reading: MeterReadingRecord | null | undefined) {
  const key = readingMonthKey(reading);
  if (!key) return undefined;

  const [year, month] = key.split("-");
  return `${month}.${year}`;
}

function submittedDateLabel(raw: string | null | undefined) {
  if (!raw || raw === "—" || raw === "вЂ”" || raw === "РІР‚вЂќ") return "";

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const localMatch = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(raw);
  if (localMatch) return `${localMatch[3]}-${localMatch[2]}-${localMatch[1]}`;

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function previousReadingForMonth(meter: MeterInfo | undefined, period: string) {
  if (!meter) return null;

  return [...meter.readings]
    .filter((reading) => {
      const key = readingMonthKey(reading);
      return key && key < period;
    })
    .sort((a, b) => readingMonthKey(b).localeCompare(readingMonthKey(a)))[0] ?? null;
}

function readingForMonth(meter: MeterInfo | undefined, period: string) {
  if (!meter) return null;

  return [...meter.readings]
    .filter((reading) => readingMonthKey(reading) === period)
    .sort((a, b) => submittedDateLabel(b.submittedAt).localeCompare(submittedDateLabel(a.submittedAt)))[0] ?? null;
}

function previousReadingValue(reading: MeterReadingRecord | null | undefined) {
  if (!reading) return "—";
  return reading.currentValue || reading.previousValue || "—";
}

function compareReadingsAscending(left: MeterReadingRecord, right: MeterReadingRecord) {
  const leftMonth = readingMonthKey(left);
  const rightMonth = readingMonthKey(right);
  if (leftMonth !== rightMonth) return leftMonth.localeCompare(rightMonth);
  return submittedDateLabel(left.submittedAt).localeCompare(submittedDateLabel(right.submittedAt));
}

function normalizeInitialMeterReadings(apartments: ApartmentMeterData[]) {
  return apartments.map((apartment) => ({
    ...apartment,
    meters: apartment.meters.map((meter) => {
      if (meter.readings.length === 0) return meter;

      const firstReading = [...meter.readings].sort(compareReadingsAscending)[0];
      const readings = meter.readings.map((reading) =>
        reading === firstReading || reading.id === firstReading.id
          ? {
              ...reading,
              previousValue: "-",
              consumption: formatConsumption(0),
              isInitialReading: true,
            }
          : { ...reading, isInitialReading: false },
      );
      const latestReading = readings
        .slice()
        .sort((left, right) => readingMonthKey(right).localeCompare(readingMonthKey(left)))[0] ?? null;

      return {
        ...meter,
        readings,
        latestReading,
      };
    }),
  }));
}

function buildManagementMeterReadingsState(initialData: MeterReadingsInitialData): ManagementMeterReadingsState {
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
  const approvedBuildingItems = buildingItems.filter((item) => isApprovedBuilding(item as { status?: unknown }));
  const hasBuildingApprovalData = buildingItems.length > 0;
  const approvedBuildingIds = new Set(
    approvedBuildingItems
      .map((item) => {
        const building = item as UnknownRecord;
        return text(building.id, building.buildingId);
      })
      .filter(Boolean),
  );
  const buildingDataById = new Map<string, UnknownRecord>();
  approvedBuildingItems.forEach((item) => {
    const building = item as UnknownRecord;
    const id = text(building.id, building.buildingId);
    if (id) buildingDataById.set(id, building);
  });

  const managedBuildings = approvedBuildingItems
    .map((item): ManagedBuildingOption | null => {
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
        waterEnabled: readingConfig.waterEnabled !== false,
        electricityEnabled: Boolean(readingConfig.electricityEnabled),
        electricityFixedPriceEnabled: Boolean(readingConfig.electricityFixedPriceEnabled),
        electricityPricePerKwh: Math.max(0, numberValue(readingConfig.electricityPricePerKwh)),
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
    if (hasBuildingApprovalData && buildingId && !approvedBuildingIds.has(buildingId)) return;
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
    const configuredMeters = allowedKeys
      ? meters.filter((meter) => allowedKeys.has(meter.meterKey))
      : meters;
    const existingKeys = new Set(configuredMeters.map((meter) => meter.meterKey));
    const fallbackMeters = fallbackMetersFromBuilding(apartmentId, buildingData)
      .filter((meter) => !existingKeys.has(meter.meterKey));

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
    const apartmentNumber = String(i.apartmentNumber || i.apartment || apartmentId || "вЂ”");
    const buildingId = String(i.buildingId || "");
    if (hasBuildingApprovalData && buildingId && !approvedBuildingIds.has(buildingId)) return;
    const buildingName = String(i.buildingName || "");
    const buildingAddress = String(i.buildingAddress || "");
    const existingApartment = apartmentMap.get(apartmentId);
    const buildingLabel = buildingAddress || buildingName || existingApartment?.buildingLabel || (buildingId ? `#${buildingId}` : "Unknown");
    const building = buildingId || existingApartment?.building || buildingLabel;

    let meterType = "Water";
    const meterKey = String(i.meterKey || "");
    const meterNameValue = String(i.meterName || "");
    const readingBuildingData = buildingDataById.get(buildingId);
    const allowedKeys = allowedMeterKeysFromBuilding(readingBuildingData);
    if (allowedKeys && !allowedKeys.has(meterKey as MeterInfo["meterKey"])) return;

    if (meterKey === "electricitymeter" || meterNameValue.toLowerCase().includes("electric")) {
      meterType = "Electricity";
    } else if (meterKey === "hotmeterwater" || meterNameValue.toLowerCase().includes("hot")) {
      meterType = "Hot Water";
    } else if (meterKey === "coldmeterwater" || meterNameValue.toLowerCase().includes("cold")) {
      meterType = "Cold Water";
    }

    let date: Date | null = null;
    if (i.submittedAt) {
      date = new Date(String(i.submittedAt));
    }
    const formattedDate = date && !Number.isNaN(date.getTime())
      ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
      : "вЂ”";
    const deterministicId = [
      apartmentId,
      meterKey || meterNameValue || "meter",
      i.meterId,
      i.serialNumber,
      formattedDate,
      i.currentValue,
      i.value,
    ].filter(Boolean).join(":");

    const reading: MeterReadingRecord = {
      id: String(i.id || deterministicId),
      currentValue: String(i.currentValue || "0"),
      previousValue: i.previousValue === null || i.previousValue === undefined ? "вЂ”" : String(i.previousValue || "0"),
      consumption: formatConsumption(i.consumption),
      submittedAt: formattedDate,
      month: typeof i.month === "number" ? i.month : Number(i.month) || undefined,
      year: typeof i.year === "number" ? i.year : Number(i.year) || undefined,
      status: (i.status as "submitted" | "pending" | "verified") || "submitted",
    };

    const meterKeyTyped =
      meterKey === "hotmeterwater" || meterKey === "coldmeterwater" || meterKey === "electricitymeter"
        ? (meterKey as "hotmeterwater" | "coldmeterwater" | "electricitymeter")
        : undefined;
    const meterIdValue = i.meterId ? String(i.meterId) : undefined;

    if (apartmentMap.has(apartmentId)) {
      const existing = apartmentMap.get(apartmentId)!;
      const existingMeter = existing.meters.find((meter) => meter.meterType === meterType || (meterKeyTyped && meter.meterKey === meterKeyTyped));
      if (existingMeter) {
        existingMeter.readings.push(reading);
        existingMeter.readings.sort((left, right) => readingMonthKey(right).localeCompare(readingMonthKey(left)));
        existingMeter.latestReading = existingMeter.readings[0];
        if (!existingMeter.serialNumber && i.serialNumber) {
          existingMeter.serialNumber = String(i.serialNumber);
        }
        if (!existingMeter.meterKey && meterKeyTyped) existingMeter.meterKey = meterKeyTyped;
        if (!existingMeter.meterId && meterIdValue) existingMeter.meterId = meterIdValue;
      } else {
        existing.meters.push({
          meterType,
          meterKey: meterKeyTyped,
          meterId: meterIdValue,
          serialNumber: i.serialNumber ? String(i.serialNumber) : undefined,
          readings: [reading],
          latestReading: reading,
        });
      }
    } else {
      apartmentMap.set(apartmentId, {
        id: apartmentId,
        apartmentId,
        apartment: apartmentNumber,
        building,
        buildingLabel,
        meters: [{
          meterType,
          meterKey: meterKeyTyped,
          meterId: meterIdValue,
          serialNumber: i.serialNumber ? String(i.serialNumber) : undefined,
          readings: [reading],
          latestReading: reading,
        }],
      });
    }
  });

  return {
    managedBuildings,
    apartments: normalizeInitialMeterReadings(Array.from(apartmentMap.values())),
  };
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function xmlCell(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function downloadText(fileName: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function toCsv(rows: string[][]) {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\n")}`;
}

function toExcelHtml(rows: string[][]) {
  const tableRows = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${xmlCell(cell)}</td>`).join("")}</tr>`)
    .join("");
  return `\uFEFF<html><head><meta charset="utf-8" /></head><body><table>${tableRows}</table></body></html>`;
}

export default function ManagementCompanyPage({ initialCompanyId, initialData, canManageReadings = true }: ManagementCompanyPageProps) {
  const t = useTranslations("meterread");
  const locale = useLocale();
  const notify = useNotifications();
  const initialState = React.useMemo(
    () => initialData ? buildManagementMeterReadingsState(initialData) : null,
    [initialData],
  );
  const [apartments, setApartments] = useState<ApartmentMeterData[]>(() => initialState?.apartments ?? []); 
  const [managedBuildings, setManagedBuildings] = useState<ManagedBuildingOption[]>(() => initialState?.managedBuildings ?? []);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);
  const { values: filterValues, setValue: setFilterValue } = useFilters({
    search: "",
    building: "",
    status: "all",
  });
  const searchQuery = filterValues.search;
  const selectedBuilding = filterValues.building;
  const statusFilter = filterValues.status;
  const [activeTab, setActiveTab] = useState<UtilityTab>("water");
  const [expandedApartments, setExpandedApartments] = useState<Set<string>>(new Set());
  const [periodOpen, setPeriodOpen] = useState(false);
  const [periodTab, setPeriodTab] = useState<UtilityTab>("water");
  const [periodValues, setPeriodValues] = useState<Record<UtilityTab, SubmissionPeriodValue | null>>({
    water: null,
    electricity: null,
  });
  const [periodSaving, setPeriodSaving] = useState(false);
  const [periodDeleting, setPeriodDeleting] = useState(false);
  const [emailStats, setEmailStats] = useState<EmailDeliveryStats | null>(null);
  const [emailDeliveries, setEmailDeliveries] = useState<EmailDeliveryLogItem[]>([]);
  const [emailStatsLoading, setEmailStatsLoading] = useState(false);
  const [emailDeliveryOpen, setEmailDeliveryOpen] = useState(false);
  const [expandedEmailDeliveryGroups, setExpandedEmailDeliveryGroups] = useState<Set<string>>(new Set());
  const [emailRecipientFilter, setEmailRecipientFilter] = useState<EmailDeliveryRecipientFilter>("all");
  const [manualReminderSending, setManualReminderSending] = useState(false);
  const [resendingDeliveryKey, setResendingDeliveryKey] = useState<string | null>(null);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const mobileActionsRef = React.useRef<HTMLDivElement | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("csv");
  const [exportReadingMonth, setExportReadingMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [exportInvoiceMonth, setExportInvoiceMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const periodValue = periodValues[activeTab];

  // Submission modal state
  const [selectAptOpen, setSelectAptOpen] = useState(false);
  const [selectAptValue, setSelectAptValue] = useState("");
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitApt, setSubmitApt] = useState<ApartmentMeterData | null>(null);
  const [submitMonth, setSubmitMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [submitCold, setSubmitCold] = useState("");
  const [submitHot, setSubmitHot] = useState("");
  const [submitElectricity, setSubmitElectricity] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmEditReadingsOpen, setConfirmEditReadingsOpen] = useState(false);
  const [submitApartmentSelectorOpen, setSubmitApartmentSelectorOpen] = useState(false);
  const submitApartmentSelectorRef = React.useRef<HTMLDivElement | null>(null);
  const submitMonthParts = React.useMemo(() => {
    const [rawYear, rawMonth] = submitMonth.split("-");
    const now = new Date();
    return {
      year: /^\d{4}$/.test(rawYear) ? rawYear : String(now.getFullYear()),
      month: /^(0[1-9]|1[0-2])$/.test(rawMonth) ? rawMonth : String(now.getMonth() + 1).padStart(2, "0"),
    };
  }, [submitMonth]);
  const submitMonthOptions = React.useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { month: "long" });
    return Array.from({ length: 12 }, (_, index) => {
      const label = formatter.format(new Date(2026, index, 1));
      return {
        value: String(index + 1).padStart(2, "0"),
        label: label.charAt(0).toLocaleUpperCase(locale) + label.slice(1),
      };
    });
  }, [locale]);
  const submitYearOptions = React.useMemo(() => {
    const selectedYear = Number(submitMonthParts.year);
    const currentYear = new Date().getFullYear();
    const start = Math.min(currentYear - 6, Number.isFinite(selectedYear) ? selectedYear : currentYear);
    const end = Math.max(currentYear + 3, Number.isFinite(selectedYear) ? selectedYear : currentYear);
    return Array.from({ length: end - start + 1 }, (_, index) => String(start + index));
  }, [submitMonthParts.year]);
  const submitMeters = React.useMemo(() => {
    const cold = submitApt?.meters.find((m) => m.meterKey === "coldmeterwater" || m.meterType.toLowerCase().includes("cold"));
    const hot = submitApt?.meters.find((m) => m.meterKey === "hotmeterwater" || m.meterType.toLowerCase().includes("hot"));
    const electricity = submitApt?.meters.find((m) => isElectricityMeter(m));
    return { cold, hot, electricity };
  }, [submitApt]);
  const submitExistingReadings = React.useMemo(() => ({
    cold: readingForMonth(submitMeters.cold, submitMonth),
    hot: readingForMonth(submitMeters.hot, submitMonth),
    electricity: readingForMonth(submitMeters.electricity, submitMonth),
  }), [submitMeters, submitMonth]);
  const submitHasExistingReadings = Boolean(
    submitExistingReadings.cold || submitExistingReadings.hot || submitExistingReadings.electricity,
  );

  React.useEffect(() => {
    if (!submitApt || !submitOpen) return;
    setSubmitCold(submitExistingReadings.cold?.currentValue ? String(submitExistingReadings.cold.currentValue) : "");
    setSubmitHot(submitExistingReadings.hot?.currentValue ? String(submitExistingReadings.hot.currentValue) : "");
    setSubmitElectricity(submitExistingReadings.electricity?.currentValue ? String(submitExistingReadings.electricity.currentValue) : "");
  }, [submitApt, submitOpen, submitExistingReadings]);

  React.useEffect(() => {
    if (!submitApartmentSelectorOpen) return;

    const closeOnOutsideClick = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (target instanceof Node && submitApartmentSelectorRef.current?.contains(target)) return;
      setSubmitApartmentSelectorOpen(false);
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("touchstart", closeOnOutsideClick);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("touchstart", closeOnOutsideClick);
    };
  }, [submitApartmentSelectorOpen]);

  React.useEffect(() => {
    if (!submitOpen) setSubmitApartmentSelectorOpen(false);
  }, [submitOpen]);

  React.useEffect(() => {
    if (selectAptOpen) setSelectAptValue("");
  }, [selectAptOpen]);

  // Period-aware status: 'submitted' (зелёный, сдано в текущем периоде),
  // 'pending' (жёлтый, период открыт, ещё не сдано), 'overdue' (красный,
  // период закрыт, не сдано). Если период не настроен — фолбэк 'submitted'.
  React.useEffect(() => {
    if (!mobileActionsOpen) return;

    const closeOnOutsideClick = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (target instanceof Node && mobileActionsRef.current?.contains(target)) return;
      setMobileActionsOpen(false);
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("touchstart", closeOnOutsideClick);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("touchstart", closeOnOutsideClick);
    };
  }, [mobileActionsOpen]);

  const getPeriodStatus = React.useCallback(
    (latestSubmittedAt?: string | null, latestSubmittedMonthKey?: string | null): "submitted" | "pending" | "overdue" => {
      const now = new Date();
      const curYear = now.getFullYear();
      const curMonth = now.getMonth();
      // Парсим последнюю отправку (формат "DD/MM/YYYY, HH:mm" или ISO)
      let submittedDate: Date | null = null;
      if (latestSubmittedAt && latestSubmittedAt !== "—") {
        const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(latestSubmittedAt);
        if (m) submittedDate = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
        else {
          const d = new Date(latestSubmittedAt);
          if (!Number.isNaN(d.getTime())) submittedDate = d;
        }
      }

      // Если сдано в текущем месяце ИЛИ в предыдущем — показываем зелёный (submitted)
      const submittedMonthKey = latestSubmittedMonthKey || monthKeyFromDateString(latestSubmittedAt);
      const keyForMonth = (year: number, month: number) => `${year}-${String(month + 1).padStart(2, "0")}`;

      if (!periodValue?.startDate || !periodValue?.endDate) {
        return submittedDate?.getFullYear() === curYear && submittedDate.getMonth() === curMonth ? "submitted" : "pending";
      }
      const startD = new Date(periodValue.startDate);
      const endD = new Date(periodValue.endDate);
      if (Number.isNaN(startD.getTime()) || Number.isNaN(endD.getTime())) {
        return "pending";
      }
      let windowStart: Date;
      let windowEnd: Date;
      if (periodValue.monthly) {
        const monthlyWindow = (year: number, month: number) => {
          const lastOfMonth = new Date(year, month + 1, 0).getDate();
          const startDay = Math.min(Math.max(startD.getDate(), 1), lastOfMonth);
          const endDay = Math.min(Math.max(endD.getDate(), 1), lastOfMonth);
          return {
            start: new Date(year, month, startDay),
            end: new Date(year, month, endDay, 23, 59, 59, 999),
          };
        };
        const currentWindow = monthlyWindow(curYear, curMonth);
        windowStart = currentWindow.start;
        windowEnd = currentWindow.end;
        if (now < windowStart) {
          const previousMonth = curMonth === 0 ? 11 : curMonth - 1;
          const previousYear = curMonth === 0 ? curYear - 1 : curYear;
          return submittedMonthKey === keyForMonth(previousYear, previousMonth) ? "submitted" : "overdue";
        }
      } else {
        windowStart = startD;
        windowEnd = new Date(endD.getFullYear(), endD.getMonth(), endD.getDate(), 23, 59, 59, 999);
      }

      if (periodValue.monthly && submittedMonthKey === keyForMonth(curYear, curMonth)) return "submitted";
      if (!periodValue.monthly && submittedDate && submittedDate >= windowStart && submittedDate <= windowEnd) return "submitted";
      if (now < windowStart) return "pending";
      if (now <= windowEnd) return "pending";
      return "overdue";
    },
    [periodValue],
  );

  const STATUS_CFG: Record<"submitted" | "pending" | "overdue", { dot: string; text: string; bg: string; border: string; label: string }> = {
    submitted: { dot: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", label: t("statusSubmitted") },
    pending: { dot: "bg-amber-500", text: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", label: t("statusPending") },
    overdue: { dot: "bg-rose-500", text: "text-rose-700", bg: "bg-rose-50", border: "border-rose-200", label: t("statusOverdue") },
  };

  const formatCubic = React.useCallback((value: number) => `${value.toFixed(3)} m\u00b3`, []);

  const renderBuildingStatsPanel = React.useCallback(
    (summary: MonthlyWaterSummary | null, buildingId: string) => {
      if (!summary) return null;
      return (
        <div className="mb-5 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t("buildingStats")}</div>
              <div className="text-base font-semibold text-slate-900 tabular-nums">{summary.label}</div>
            </div>
            {canManageReadings ? (
              <Link
                href={ROUTES.meterReadingsBuilding}
                onClick={() => {
                  try {
                    window.localStorage.setItem("domera:building-main-meter:selected-building", buildingId);
                  } catch {
                    // Ignore storage write issues during navigation.
                  }
                }}
                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 3v18h18" />
                  <path d="m7 15 4-4 3 3 5-7" />
                </svg>
                Показание дома
              </Link>
            ) : null}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-md bg-blue-50 px-2.5 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-blue-500">{t("coldWaterShort")}</div>
              <div className="mt-0.5 text-base font-bold text-blue-700 tabular-nums">{formatCubic(summary.cold)}</div>
            </div>
            <div className="rounded-md bg-rose-50 px-2.5 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-rose-500">{t("hotWaterShort")}</div>
              <div className="mt-0.5 text-base font-bold text-rose-700 tabular-nums">{formatCubic(summary.hot)}</div>
            </div>
          </div>
        </div>
      );
    },
    [canManageReadings, formatCubic, t],
  );

  // View meters modal
  const [viewOpen, setViewOpen] = useState(false);
  const [viewApt, setViewApt] = useState<ApartmentMeterData | null>(null);
  const [viewSerials, setViewSerials] = useState<{ cold: string; hot: string; electricity: string }>({ cold: "", hot: "", electricity: "" });
  const [viewDates, setViewDates] = useState<{ cold: string; hot: string; electricity: string }>({ cold: "", hot: "", electricity: "" });
  const [viewLoading, setViewLoading] = useState(false);
  const [viewSaving, setViewSaving] = useState(false);

  const openViewModal = async (apt: ApartmentMeterData) => {
    setViewApt(apt);
    setViewOpen(true);
    setViewLoading(true);
    setViewSerials({
      cold: apt.meters.find((m) => m.meterKey === "coldmeterwater")?.serialNumber ?? "",
      hot: apt.meters.find((m) => m.meterKey === "hotmeterwater")?.serialNumber ?? "",
      electricity: apt.meters.find((m) => m.meterKey === "electricitymeter")?.serialNumber ?? "",
    });
    setViewDates({ cold: "", hot: "", electricity: "" });
    try {
      const data = (await apiFetch(`/apartments/${encodeURIComponent(apt.apartmentId)}`)) as Record<string, unknown> | null;
      const wr = (data?.waterReadings ?? {}) as Record<string, Record<string, unknown> | undefined>;
      const cold = wr.coldmeterwater ?? {};
      const hot = wr.hotmeterwater ?? {};
      const electricity = wr.electricitymeter ?? {};
      const isoDate = (v: unknown): string => {
        if (!v) return "";
        if (typeof v === "string") {
          const d = new Date(v);
          if (Number.isNaN(d.getTime())) return "";
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        }
        return "";
      };
      setViewSerials({
        cold: typeof cold.serialNumber === "string" ? cold.serialNumber : (apt.meters.find((m) => m.meterKey === "coldmeterwater")?.serialNumber ?? ""),
        hot: typeof hot.serialNumber === "string" ? hot.serialNumber : (apt.meters.find((m) => m.meterKey === "hotmeterwater")?.serialNumber ?? ""),
        electricity: typeof electricity.serialNumber === "string" ? electricity.serialNumber : (apt.meters.find((m) => m.meterKey === "electricitymeter")?.serialNumber ?? ""),
      });
      setViewDates({
        cold: isoDate(cold.checkDueDate),
        hot: isoDate(hot.checkDueDate),
        electricity: isoDate(electricity.checkDueDate),
      });
    } catch (e) {
      console.error("Failed to load apartment", e);
    } finally {
      setViewLoading(false);
    }
  };

  const saveViewDates = async () => {
    if (!viewApt) return;
    try {
      setViewSaving(true);
      const body: Record<string, unknown> = {
        waterReadings: {
          coldmeterwater: {
            serialNumber: viewSerials.cold || null,
            checkDueDate: viewDates.cold || null,
          },
          hotmeterwater: {
            serialNumber: viewSerials.hot || null,
            checkDueDate: viewDates.hot || null,
          },
          electricitymeter: {
            serialNumber: viewSerials.electricity || null,
            checkDueDate: viewDates.electricity || null,
          },
        },
      };
      await apiFetch(`/apartments/${encodeURIComponent(viewApt.apartmentId)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      // reflect updated serials in list state
      setApartments((prev) =>
        prev.map((a) =>
          a.apartmentId === viewApt.apartmentId
            ? {
                ...a,
                meters: a.meters.map((m) => {
                  if (m.meterKey === "coldmeterwater") return { ...m, serialNumber: viewSerials.cold || m.serialNumber };
                  if (m.meterKey === "hotmeterwater") return { ...m, serialNumber: viewSerials.hot || m.serialNumber };
                  if (m.meterKey === "electricitymeter") return { ...m, serialNumber: viewSerials.electricity || m.serialNumber };
                  return m;
                }),
              }
            : a,
        ),
      );
      notify.success(t("notifyMetersSaved"));
      setViewOpen(false);
    } catch (e) {
      console.error(e);
      notify.error(t("notifySaveError"));
    } finally {
      setViewSaving(false);
    }
  };

  const [deletingMonthKey, setDeletingMonthKey] = useState<string | null>(null);

  const deleteMonthReadings = async (apartmentId: string, monthKey: string, readingIds: string[]) => {
    if (!apartmentId || readingIds.length === 0) return;
    if (!window.confirm(t("confirmDeleteMonth", { monthKey }))) return;
    const tag = `${apartmentId}:${monthKey}`;
    try {
      setDeletingMonthKey(tag);
      // Секвенциально — иначе параллельные set({merge}) перезапишут друг друга.
      for (const readingId of readingIds) {
        await apiFetch(
          `/meter-readings/${encodeURIComponent(readingId)}?apartmentId=${encodeURIComponent(apartmentId)}`,
          { method: "DELETE" },
        );
      }
      setApartments((prev) =>
        normalizeInitialMeterReadings(prev.map((a) => {
          if (a.apartmentId !== apartmentId) return a;
          const idSet = new Set(readingIds);
          return {
            ...a,
            meters: a.meters.map((m) => {
              const filtered = m.readings.filter((r) => !idSet.has(r.id));
              return { ...m, readings: filtered, latestReading: filtered[0] ?? null };
            }),
          };
        })),
      );
      notify.success(t("notifyDeletedReadings", { monthKey }));
    } catch (e) {
      console.error(e);
      notify.error(t("notifyDeleteError"));
    } finally {
      setDeletingMonthKey(null);
    }
  };

  const openSubmitModal = (apt: ApartmentMeterData) => {
    setSubmitApt(apt);
    setSubmitCold("");
    setSubmitHot("");
    setSubmitElectricity("");
    const d = new Date();
    setSubmitMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    setSubmitOpen(true);
  };

  const submitReadings = async (skipEditConfirm = false) => {
    if (!submitApt) return;
    const [yearStr, monthStr] = submitMonth.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    const { cold: coldMeter, hot: hotMeter, electricity: electricityMeter } = submitMeters;
    const parseReadingValue = (raw: string) => Number(raw.replace(",", "."));
    const readingValueChanged = (reading: MeterReadingRecord | null, raw: string) => {
      if (!reading) return false;
      const nextValue = parseReadingValue(raw);
      const existingValue = Number(String(reading.currentValue ?? "").replace(",", "."));
      return Number.isFinite(nextValue) && Number.isFinite(existingValue) && nextValue !== existingValue;
    };
    const buildReadingData = (meter: MeterInfo, currentValueStr: string) => {
      const currentValue = Number(currentValueStr.replace(",", "."));
      const previousReading = previousReadingForMonth(meter, submitMonth);
      const parsedPreviousValue = Number(previousReading?.currentValue ?? previousReading?.previousValue ?? 0);
      const previousValue = Number.isFinite(parsedPreviousValue) ? parsedPreviousValue : 0;
      return {
        apartmentId: submitApt.apartmentId,
        meterId: meter.meterId ?? meter.serialNumber ?? "",
        meterKey: meter.meterKey,
        meterDigits: meter.meterKey === "electricitymeter" ? meter.meterDigits ?? 6 : undefined,
        previousValue,
        currentValue,
        consumption: consumptionValue(currentValue, previousValue),
        buildingId: submitApt.building,
        month,
        year,
      };
    };
    const entries = [
      { meter: coldMeter, value: submitCold, label: t("coldWater"), existing: submitExistingReadings.cold },
      { meter: hotMeter, value: submitHot, label: t("hotWater"), existing: submitExistingReadings.hot },
      { meter: electricityMeter, value: submitElectricity, label: t("electricity"), existing: submitExistingReadings.electricity },
    ].filter((entry): entry is { meter: MeterInfo; value: string; label: string; existing: MeterReadingRecord | null } => Boolean(entry.meter && entry.value));
    const changedExistingEntries = entries.filter((entry) => readingValueChanged(entry.existing, entry.value));
    if (!skipEditConfirm && changedExistingEntries.length > 0) {
      setConfirmEditReadingsOpen(true);
      return;
    }
    try {
      setSubmitting(true);
      // Валидация: текущее показание не должно быть меньше предыдущего.
      const violations: string[] = [];
      const checkBelowPrevious = (meter: MeterInfo | undefined, raw: string, label: string) => {
        if (!meter || !raw) return;
        const currentValue = Number(raw.replace(",", "."));
        const previousReading = previousReadingForMonth(meter, submitMonth);
        const parsedPreviousValue = Number(previousReading?.currentValue ?? previousReading?.previousValue ?? 0);
        const previousValue = Number.isFinite(parsedPreviousValue) ? parsedPreviousValue : 0;
        if (Number.isFinite(currentValue) && Number.isFinite(previousValue) && currentValue < previousValue) {
          violations.push(`${label}: ${currentValue} < ${previousValue}`);
        }
      };
      checkBelowPrevious(coldMeter, submitCold, t("coldWater"));
      checkBelowPrevious(hotMeter, submitHot, t("hotWater"));
      checkBelowPrevious(electricityMeter, submitElectricity, t("electricity"));
      if (violations.length > 0) {
        notify.error(t("notifyBelowPrevious", { violations: violations.join("; ") }));
        return;
      }
      let count = 0;
      let editedCount = 0;
      // Секвенциально: два параллельных письма в документ apartments перезапишут друг друга.
      for (const entry of entries) {
        const data = buildReadingData(entry.meter, entry.value);
        if (entry.existing) {
          if (!readingValueChanged(entry.existing, entry.value)) continue;
          await apiFetch(`/meter-readings/${encodeURIComponent(entry.existing.id)}`, {
            method: "PATCH",
            body: JSON.stringify({
              apartmentId: submitApt.apartmentId,
              data: {
                previousValue: data.previousValue,
                currentValue: data.currentValue,
                consumption: data.consumption,
                month,
                year,
              },
            }),
          });
          editedCount += 1;
        } else {
          await apiFetch(`/meter-readings`, { method: "POST", body: JSON.stringify(data) });
        }
        count += 1;
      }
      if (count === 0) {
        notify.info(entries.length === 0 ? t("notifyEnterAtLeastOne") : t("notifyNoReadingChanges"));
        return;
      }
      // Локальное обновление без перезагрузки
      setApartments((prev) =>
        prev.map((a) => {
          if (a.apartmentId !== submitApt.apartmentId) return a;
          const now = new Date();
          return {
            ...a,
            meters: a.meters.map((m) => {
              if (coldMeter && submitCold && (m.meterKey === "coldmeterwater" || m.meterId === coldMeter.meterId)) {
                const currentVal = Number(submitCold.replace(",", "."));
                const previousReading = previousReadingForMonth(m, submitMonth);
                const parsedPrevVal = Number(previousReading?.currentValue ?? previousReading?.previousValue ?? 0);
                const prevVal = Number.isFinite(parsedPrevVal) ? parsedPrevVal : 0;
                const existingReading = readingForMonth(m, submitMonth);
                const nextReading: MeterReadingRecord = {
                  id: existingReading?.id ?? `local-${submitApt.apartmentId}-${m.meterKey ?? m.meterId ?? "cold"}-${submitMonth}`,
                  previousValue: String(prevVal),
                  currentValue: String(currentVal),
                  consumption: formatConsumption(consumptionValue(currentVal, prevVal)),
                  submittedAt: existingReading?.submittedAt ?? `${submitMonth}-${String(now.getDate()).padStart(2, "0")}`,
                  month,
                  year,
                  status: "submitted" as const,
                };
                return {
                  ...m,
                  readings: [nextReading, ...m.readings.filter((reading) => readingMonthKey(reading) !== submitMonth)]
                    .sort((left, right) => readingMonthKey(right).localeCompare(readingMonthKey(left))),
                  latestReading: nextReading,
                };
              }
              if (hotMeter && submitHot && (m.meterKey === "hotmeterwater" || m.meterId === hotMeter.meterId)) {
                const currentVal = Number(submitHot.replace(",", "."));
                const previousReading = previousReadingForMonth(m, submitMonth);
                const parsedPrevVal = Number(previousReading?.currentValue ?? previousReading?.previousValue ?? 0);
                const prevVal = Number.isFinite(parsedPrevVal) ? parsedPrevVal : 0;
                const existingReading = readingForMonth(m, submitMonth);
                const nextReading: MeterReadingRecord = {
                  id: existingReading?.id ?? `local-${submitApt.apartmentId}-${m.meterKey ?? m.meterId ?? "hot"}-${submitMonth}`,
                  previousValue: String(prevVal),
                  currentValue: String(currentVal),
                  consumption: formatConsumption(consumptionValue(currentVal, prevVal)),
                  submittedAt: existingReading?.submittedAt ?? `${submitMonth}-${String(now.getDate()).padStart(2, "0")}`,
                  month,
                  year,
                  status: "submitted" as const,
                };
                return {
                  ...m,
                  readings: [nextReading, ...m.readings.filter((reading) => readingMonthKey(reading) !== submitMonth)]
                    .sort((left, right) => readingMonthKey(right).localeCompare(readingMonthKey(left))),
                  latestReading: nextReading,
                };
              }
              if (electricityMeter && submitElectricity && (m.meterKey === "electricitymeter" || m.meterId === electricityMeter.meterId)) {
                const currentVal = Number(submitElectricity.replace(",", "."));
                const previousReading = previousReadingForMonth(m, submitMonth);
                const parsedPrevVal = Number(previousReading?.currentValue ?? previousReading?.previousValue ?? 0);
                const prevVal = Number.isFinite(parsedPrevVal) ? parsedPrevVal : 0;
                const existingReading = readingForMonth(m, submitMonth);
                const nextReading: MeterReadingRecord = {
                  id: existingReading?.id ?? `local-${submitApt.apartmentId}-${m.meterKey ?? m.meterId ?? "electricity"}-${submitMonth}`,
                  previousValue: String(prevVal),
                  currentValue: String(currentVal),
                  consumption: formatConsumption(consumptionValue(currentVal, prevVal)),
                  submittedAt: existingReading?.submittedAt ?? `${submitMonth}-${String(now.getDate()).padStart(2, "0")}`,
                  month,
                  year,
                  status: "submitted" as const,
                };
                return {
                  ...m,
                  readings: [nextReading, ...m.readings.filter((reading) => readingMonthKey(reading) !== submitMonth)]
                    .sort((left, right) => readingMonthKey(right).localeCompare(readingMonthKey(left))),
                  latestReading: nextReading,
                };
              }
              return m;
            }),
          };
        }),
      );
      notify.success(editedCount > 0 ? t("notifyReadingsUpdated") : t("notifyReadingsSent"));
      setSubmitOpen(false);
    } catch (e) {
      console.error(e);
      notify.error(t("notifySendError"));
    } finally {
      setSubmitting(false);
    }
  };
  // Ключ: все данные только после монтирования
  useEffect(() => {
    if (initialData) {
      return;
    }

    let isMounted = true;
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        // Сначала получаем профиль пользователя
        let companyId: string | null = initialCompanyId?.trim() || null;

        // Получаем профиль пользователя, который содержит companyId
        if (!companyId) {
          const profileResponse = await apiFetch("/users/me");
          const profile = profileResponse as Record<string, unknown>;
          const userId = (typeof profile.uid === "string" && profile.uid) ||
                         (typeof profile.id === "string" && profile.id) ||
                         null;

          companyId = (typeof profile.companyId === "string" && profile.companyId) ||
                     userId ||
                     null;
        }

        if (!companyId) {
          setError("Company ID not found in your profile. Please verify your account setup.");
          setLoading(false);
          return;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const [rawResponse, buildingsResponse, apartmentsResponse] = await Promise.all([
          apiFetch(`/meter-readings?companyId=${encodeURIComponent(String(companyId))}`, { signal: controller.signal }),
          apiFetch(`/buildings?companyId=${encodeURIComponent(String(companyId))}`, { signal: controller.signal }).catch(() => null),
          apiFetch(`/apartments?companyId=${encodeURIComponent(String(companyId))}`, { signal: controller.signal }).catch(() => null),
        ]);
        clearTimeout(timeoutId);
        const response = rawResponse as unknown;
        const items = Array.isArray(response)
          ? (response as unknown[])
          : ((response as { items?: unknown[] })?.items ?? []);
        const buildingItems = Array.isArray((buildingsResponse as { items?: unknown[] } | null)?.items)
          ? ((buildingsResponse as { items?: unknown[] }).items ?? [])
          : [];
        const apartmentItems = Array.isArray((apartmentsResponse as { items?: unknown[] } | null)?.items)
          ? ((apartmentsResponse as { items?: unknown[] }).items ?? [])
          : [];
        const approvedBuildingItems = buildingItems.filter((item) => isApprovedBuilding(item as { status?: unknown }));
        const hasBuildingApprovalData = buildingItems.length > 0;
        const approvedBuildingIds = new Set(
          approvedBuildingItems
            .map((item) => {
              const building = item as UnknownRecord;
              return text(building.id, building.buildingId);
            })
            .filter(Boolean),
        );
        const buildingDataById = new Map<string, UnknownRecord>();
        approvedBuildingItems.forEach((item) => {
          const building = item as UnknownRecord;
          const id = text(building.id, building.buildingId);
          if (id) buildingDataById.set(id, building);
        });
        
        if (isMounted) {
          setManagedBuildings(
            approvedBuildingItems
              .map((item): ManagedBuildingOption | null => {
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
                  waterEnabled: readingConfig.waterEnabled !== false,
                  electricityEnabled: Boolean(readingConfig.electricityEnabled),
                  electricityFixedPriceEnabled: Boolean(readingConfig.electricityFixedPriceEnabled),
                  electricityPricePerKwh: Math.max(0, numberValue(readingConfig.electricityPricePerKwh)),
                } : null;
              })
              .filter((item): item is ManagedBuildingOption => Boolean(item))
              .sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: "base" })),
          );

          const apartmentMap = new Map<string, ApartmentMeterData>();

          apartmentItems.forEach((item: unknown) => {
            const apartment = item as UnknownRecord;
            const apartmentId = text(apartment.id, apartment.apartmentId, apartment.readableId);
            if (!apartmentId) return;

            const buildingId = text(apartment.buildingId);
            if (hasBuildingApprovalData && buildingId && !approvedBuildingIds.has(buildingId)) return;
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
            const configuredMeters = allowedKeys
              ? meters.filter((meter) => allowedKeys.has(meter.meterKey))
              : meters;
            const existingKeys = new Set(configuredMeters.map((meter) => meter.meterKey));
            const fallbackMeters = fallbackMetersFromBuilding(apartmentId, buildingData)
              .filter((meter) => !existingKeys.has(meter.meterKey));

            apartmentMap.set(apartmentId, {
              id: apartmentId,
              apartmentId,
              apartment: text(apartment.number, apartment.apartmentNumber, apartment.label, apartment.name, apartmentId),
              building: buildingId || buildingLabel,
              buildingLabel,
              meters: [...configuredMeters, ...fallbackMeters],
            });
          });

          if (items.length > 0) {
            // Группируем показания по квартирам

            items.forEach((item: unknown) => {
              const i = item as UnknownRecord;
              const apartmentId = String(i.apartmentId || "");
              if (!apartmentId) return;
              const apartmentNumber = String(
                i.apartmentNumber || i.apartment || apartmentId || "—"
              );
              const buildingId = String(i.buildingId || "");
              if (hasBuildingApprovalData && buildingId && !approvedBuildingIds.has(buildingId)) return;
              const buildingName = String(i.buildingName || "");
              const buildingAddress = String(i.buildingAddress || "");
              const existingApartment = apartmentMap.get(apartmentId);
              const buildingLabel = buildingAddress || buildingName || existingApartment?.buildingLabel || (buildingId ? `#${buildingId}` : "Unknown");
              const building = buildingId || existingApartment?.building || buildingLabel;
              
              // Определяем тип счётчика
              let meterType = "Water";
              const meterKey = String(i.meterKey || "");
              const meterNameValue = String(i.meterName || "");
              const readingBuildingData = buildingDataById.get(buildingId);
              const allowedKeys = allowedMeterKeysFromBuilding(readingBuildingData);
              if (allowedKeys && !allowedKeys.has(meterKey as MeterInfo["meterKey"])) return;
              
              if (meterKey === "electricitymeter" || meterNameValue.toLowerCase().includes("electric")) {
                meterType = "Electricity";
              } else if (meterKey === "hotmeterwater" || meterNameValue.toLowerCase().includes("hot")) {
                meterType = "Hot Water";
              } else if (meterKey === "coldmeterwater" || meterNameValue.toLowerCase().includes("cold")) {
                meterType = "Cold Water";
              }

              // Парсим ISO 8601 дату от бэкенда
              let date: Date | null = null;
              if (i.submittedAt) {
                date = new Date(String(i.submittedAt));
              }
              const formattedDate = date && !Number.isNaN(date.getTime())
                ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
                : "—";

              const reading: MeterReadingRecord = {
                id: String(i.id || Math.random()),
                currentValue: String(i.currentValue || "0"),
                previousValue: i.previousValue === null || i.previousValue === undefined ? "—" : String(i.previousValue || "0"),
                consumption: formatConsumption(i.consumption),
                submittedAt: formattedDate,
                month: typeof i.month === "number" ? i.month : Number(i.month) || undefined,
                year: typeof i.year === "number" ? i.year : Number(i.year) || undefined,
                status: (i.status as "submitted" | "pending" | "verified") || "submitted",
              };

              const meterKeyTyped =
                meterKey === "hotmeterwater" || meterKey === "coldmeterwater" || meterKey === "electricitymeter"
                  ? (meterKey as "hotmeterwater" | "coldmeterwater" | "electricitymeter")
                  : undefined;
              const meterIdValue = i.meterId ? String(i.meterId) : undefined;

              if (apartmentMap.has(apartmentId)) {
                const existing = apartmentMap.get(apartmentId)!;
                // Ищем существующий счётчик того же типа
                const existingMeter = existing.meters.find(m => m.meterType === meterType || (meterKeyTyped && m.meterKey === meterKeyTyped));
                if (existingMeter) {
                  existingMeter.readings.push(reading);
                  existingMeter.readings.sort((a, b) => readingMonthKey(b).localeCompare(readingMonthKey(a)));
                  existingMeter.latestReading = existingMeter.readings[0];
                  if (!existingMeter.serialNumber && i.serialNumber) {
                    existingMeter.serialNumber = String(i.serialNumber);
                  }
                  if (!existingMeter.meterKey && meterKeyTyped) existingMeter.meterKey = meterKeyTyped;
                  if (!existingMeter.meterId && meterIdValue) existingMeter.meterId = meterIdValue;
                } else {
                  // Добавляем новый тип счётчика
                  existing.meters.push({
                    meterType,
                    meterKey: meterKeyTyped,
                    meterId: meterIdValue,
                    serialNumber: i.serialNumber ? String(i.serialNumber) : undefined,
                    readings: [reading],
                    latestReading: reading,
                  });
                }
              } else {
                apartmentMap.set(apartmentId, {
                  id: apartmentId,
                  apartmentId: apartmentId,
                  apartment: apartmentNumber,
                  building: building,
                  buildingLabel: buildingLabel,
                  meters: [{
                    meterType,
                    meterKey: meterKeyTyped,
                    meterId: meterIdValue,
                    serialNumber: i.serialNumber ? String(i.serialNumber) : undefined,
                    readings: [reading],
                    latestReading: reading,
                  }],
                });
              }
            });

            const apartmentList = normalizeInitialMeterReadings(Array.from(apartmentMap.values()));
            setApartments(apartmentList);
          } else {
            setApartments(normalizeInitialMeterReadings(Array.from(apartmentMap.values())));
          }
        }
      } catch (err) {
        console.error("Error loading meter readings:", err);
        setError("Failed to load meter readings");
        setApartments([]);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    return () => {
      isMounted = false;
    };
  }, [initialCompanyId, initialData]);

  const buildings = managedBuildings.length > 0
    ? managedBuildings.map((building) => building.id)
    : [...new Set(apartments.map((r) => r.building))].sort();
  const buildingLabels = new Map<string, string>();
  const buildingApartmentCounts = new Map<string, number>();
  managedBuildings.forEach((building) => {
    buildingLabels.set(building.id, building.label);
    buildingApartmentCounts.set(building.id, building.apartmentCount);
  });
  apartments.forEach((a) => {
    if (!buildingLabels.has(a.building)) buildingLabels.set(a.building, a.buildingLabel || a.building);
  });
  const effectiveBuilding =
    selectedBuilding && buildings.includes(selectedBuilding)
      ? selectedBuilding
      : (buildings[0] ?? "");
  const selectedBuildingApartmentCount = buildingApartmentCounts.get(effectiveBuilding);
  const selectedBuildingHasNoApartments = selectedBuildingApartmentCount === 0;
  const selectedBuildingOption = managedBuildings.find((building) => building.id === effectiveBuilding);

  const loadEmailStats = React.useCallback(async () => {
    if (!effectiveBuilding) {
      setEmailStats(null);
      setEmailDeliveries([]);
      return;
    }

    setEmailStatsLoading(true);
    try {
      const query = new URLSearchParams({
        type: "meterReadingReminder",
        buildingId: effectiveBuilding,
      });
      const stats = await apiFetch<EmailDeliveryStats>(`/emails/stats?${query.toString()}`, {
        staleTimeMs: 5_000,
      });
      const deliveryQuery = new URLSearchParams({
        type: "meterReadingReminder",
        buildingId: effectiveBuilding,
        deliveryKeyPrefix: "meter-reading-reminder:",
        limit: "2000",
      });
      const deliveries = await apiFetch<EmailDeliveryLogItem[]>(`/emails/deliveries?${deliveryQuery.toString()}`, {
        staleTimeMs: 5_000,
      });
      setEmailStats(stats);
      setEmailDeliveries(deliveries);
    } catch (error) {
      console.error("Failed to load email delivery stats", error);
      setEmailStats(null);
      setEmailDeliveries([]);
    } finally {
      setEmailStatsLoading(false);
    }
  }, [effectiveBuilding]);

  React.useEffect(() => {
    if (selectedBuilding !== effectiveBuilding) {
      setFilterValue("building", effectiveBuilding);
    }
  }, [effectiveBuilding, selectedBuilding, setFilterValue]);

  React.useEffect(() => {
    if (!periodOpen) return;
    loadEmailStats();
  }, [loadEmailStats, periodOpen]);

  // Load saved submission period for selected building
  React.useEffect(() => {
    if (!effectiveBuilding) {
      setPeriodValues({ water: null, electricity: null });
      return;
    }
    let cancelled = false;
    apiFetch(`/buildings/${encodeURIComponent(effectiveBuilding)}`)
      .then((res) => {
        if (cancelled) return;
        const cfg = (res as {
          readingConfig?: {
            submissionPeriod?: SubmissionPeriodValue | null;
            waterSubmissionPeriod?: SubmissionPeriodValue | null;
            electricitySubmissionPeriod?: SubmissionPeriodValue | null;
          };
        })?.readingConfig;
        setPeriodValues({
          water: cfg?.waterSubmissionPeriod ?? cfg?.submissionPeriod ?? null,
          electricity: cfg?.electricitySubmissionPeriod ?? null,
        });
      })
      .catch(() => {
        if (!cancelled) setPeriodValues({ water: null, electricity: null });
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveBuilding]);

  const savePeriodFor = async (tab: UtilityTab, value: SubmissionPeriodValue | null) => {
    if (!effectiveBuilding) return;
    const periodKey = tab === "water" ? "waterSubmissionPeriod" : "electricitySubmissionPeriod";
    const readingConfig = tab === "water"
      ? { submissionPeriod: value, waterSubmissionPeriod: value }
      : { [periodKey]: value };
    setPeriodSaving(true);
    try {
      await apiFetch(`/buildings/${encodeURIComponent(effectiveBuilding)}`, {
        method: "PATCH",
        body: JSON.stringify({ readingConfig }),
        headers: { "Content-Type": "application/json" },
      });
      setPeriodValues((current) => ({ ...current, [tab]: value }));
      void loadEmailStats();
      notify.success(t("notifyPeriodSaved"));
    } catch (e) {
      console.error("Failed to save submission period", e);
      notify.error(t("notifyPeriodSaveError"));
    } finally {
      setPeriodSaving(false);
    }
  };

  const deletePeriodFor = async (tab: UtilityTab) => {
    setPeriodDeleting(true);
    const periodKey = tab === "water" ? "waterSubmissionPeriod" : "electricitySubmissionPeriod";
    const readingConfig = tab === "water"
      ? { submissionPeriod: null, waterSubmissionPeriod: null }
      : { [periodKey]: null };
    try {
      await apiFetch(`/buildings/${encodeURIComponent(effectiveBuilding)}`, {
        method: "PATCH",
        body: JSON.stringify({ readingConfig }),
        headers: { "Content-Type": "application/json" },
      });
      setPeriodValues((current) => ({ ...current, [tab]: null }));
      void loadEmailStats();
      notify.success(t("notifyPeriodDeleted"));
    } catch (e) {
      console.error("Failed to delete submission period", e);
      notify.error(t("notifyPeriodDeleteError"));
    } finally {
      setPeriodDeleting(false);
    }
  };

  const filterFields: FilterField[] = [
    { name: "search", type: "search", placeholder: t("searchPlaceholder") },
    {
      name: "building",
      type: "select",
      visible: false,
      options: buildings.map((b) => ({ value: b, label: buildingLabels.get(b) || b })),
    },
    {
      name: "status",
      type: "select",
      options: [
        { value: "all", label: t("statusAll") },
        { value: "submitted", label: t("statusSubmitted") },
        { value: "pending", label: t("statusPending") },
        { value: "overdue", label: t("statusOverdue") },
        { value: "verified", label: t("statusVerified") },
      ],
    },
  ];

  const buildingScopedApartments = apartments.filter((item) => !effectiveBuilding || item.building === effectiveBuilding);
  const hasWaterMeters = buildingScopedApartments.some((apartment) => apartment.meters.some((meter) => meterMatchesTab(meter, "water")));
  const hasElectricityMeters = buildingScopedApartments.some((apartment) => apartment.meters.some((meter) => meterMatchesTab(meter, "electricity")));
  const waterReadingsEnabled = selectedBuildingOption ? selectedBuildingOption.waterEnabled !== false : hasWaterMeters;
  const electricityReadingsEnabled = selectedBuildingOption ? Boolean(selectedBuildingOption.electricityEnabled) : hasElectricityMeters;
  const hasWaterTab = waterReadingsEnabled && hasWaterMeters;
  const hasElectricityTab = electricityReadingsEnabled && hasElectricityMeters;
  const availableTabs: UtilityTab[] = hasWaterTab && hasElectricityTab
    ? ["water", "electricity"]
    : hasWaterTab
      ? ["water"]
      : hasElectricityTab
        ? ["electricity"]
        : [];
  const periodAvailableTabs: UtilityTab[] = [
    ...(waterReadingsEnabled ? ["water" as const] : []),
    ...(electricityReadingsEnabled ? ["electricity" as const] : []),
  ];
  const effectiveTab = availableTabs.includes(activeTab) ? activeTab : availableTabs[0] ?? activeTab;
  const effectivePeriodTab = periodAvailableTabs.includes(periodTab) ? periodTab : periodAvailableTabs[0] ?? periodTab;
  const activePeriodButtonLabel = periodButtonLabel(periodValues[effectiveTab]);
  const fallbackPeriodButtonLabel = periodAvailableTabs
    .map((tab) => periodButtonLabel(periodValues[tab]))
    .find(Boolean);
  const periodActionLabel = activePeriodButtonLabel || fallbackPeriodButtonLabel || t("periodModalTitle");
  const periodOpenTab = periodAvailableTabs.includes(effectiveTab) ? effectiveTab : effectivePeriodTab;

  const sendManualReminder = React.useCallback(async () => {
    if (!effectiveBuilding || manualReminderSending) return;

    setManualReminderSending(true);
    try {
      const result = await apiFetch<ManualReminderResult>("/meter-readings/reminders/send", {
        method: "POST",
        body: JSON.stringify({
          buildingId: effectiveBuilding,
          utility: effectivePeriodTab,
          language: locale,
        }),
      });
      notify.success(t("manualReminderResult", {
        sent: result.sent,
        failed: result.failed,
        skipped: result.skippedNoEmail + result.skippedSubmitted,
      }));
      await loadEmailStats();
    } catch (error) {
      console.error("Failed to send manual reminders", error);
      notify.error(error instanceof Error ? error.message : t("manualReminderFailed"));
    } finally {
      setManualReminderSending(false);
    }
  }, [effectiveBuilding, effectivePeriodTab, loadEmailStats, manualReminderSending, notify, t]);

  const emailDeliveryGroups = React.useMemo(() => {
    const groups = new Map<string, EmailDeliveryGroup>();

    emailDeliveries.forEach((item) => {
      const parts = item.deliveryKey?.split(":") ?? [];
      if (
        parts[0] !== "meter-reading-reminder" ||
        (parts[2] !== "water" && parts[2] !== "electricity") ||
        (parts[3] !== "start" && parts[3] !== "end" && parts[3] !== "close") ||
        !parts[4]
      ) {
        return;
      }

      const key = parts.slice(0, 5).join(":");
      const existing = groups.get(key) ?? {
        key,
        utility: parts[2] as UtilityTab,
        stage: parts[3] as "start" | "end" | "close",
        date: parts[4],
        total: 0,
        success: 0,
        error: 0,
        lastAt: null,
      };

      existing.total += 1;
      if (item.status === "success") existing.success += 1;
      if (item.status === "error") existing.error += 1;
      if (item.createdAt && (!existing.lastAt || new Date(item.createdAt).getTime() > new Date(existing.lastAt).getTime())) {
        existing.lastAt = item.createdAt;
      }
      groups.set(key, existing);
    });

    return Array.from(groups.values()).sort((a, b) => (
      new Date(b.lastAt ?? 0).getTime() - new Date(a.lastAt ?? 0).getTime()
    ));
  }, [emailDeliveries]);

  const orderedBuildingApartments = React.useMemo(() => (
    buildingScopedApartments
      .slice()
      .sort((left, right) => left.apartment.localeCompare(right.apartment, undefined, {
        numeric: true,
        sensitivity: "base",
      }))
  ), [buildingScopedApartments]);

  const emailDeliveryRowsForGroup = React.useCallback((groupKey: string) => {
    return orderedBuildingApartments
      .map((apartment) => {
        const attempts = emailDeliveries
          .filter((item) => item.apartmentId === apartment.apartmentId && item.deliveryKey?.startsWith(`${groupKey}:`))
          .sort((left, right) => new Date(right.createdAt ?? 0).getTime() - new Date(left.createdAt ?? 0).getTime());
        const successful = attempts.find((item) => item.status === "success");
        const latest = successful ?? attempts[0];
        const status: EmailDeliveryRecipientStatus = successful ? "success" : latest?.status === "error" ? "error" : "missing";
        return {
          id: apartment.apartmentId,
          apartment: apartment.apartment,
          email: latest?.to || apartment.residentEmail || apartment.ownerEmail || "",
          status,
          createdAt: latest?.createdAt ?? null,
          errorMessage: status === "error" ? latest?.errorMessage : undefined,
        };
      })
      .filter((item) => emailRecipientFilter === "all" || item.status === emailRecipientFilter);
  }, [emailDeliveries, emailRecipientFilter, orderedBuildingApartments]);

  const resendMissingAutoReminder = React.useCallback(async (deliveryKey: string) => {
    if (resendingDeliveryKey) return;

    setResendingDeliveryKey(deliveryKey);
    try {
      const result = await apiFetch<ManualReminderResult & { skippedAlreadySent?: number }>("/meter-readings/reminders/resend-missing", {
        method: "POST",
        body: JSON.stringify({
          deliveryKey,
          language: locale,
        }),
      });
      notify.success(t("emailDeliveryResendResult", {
        sent: result.sent,
        failed: result.failed,
        skipped: result.skippedNoEmail + result.skippedSubmitted + (result.skippedAlreadySent ?? 0),
      }));
      await loadEmailStats();
    } catch (error) {
      console.error("Failed to resend automatic reminders", error);
      notify.error(error instanceof Error ? error.message : t("emailDeliveryResendFailed"));
    } finally {
      setResendingDeliveryKey(null);
    }
  }, [loadEmailStats, locale, notify, resendingDeliveryKey, t]);

  const resendAllMissingAutoReminders = React.useCallback(async () => {
    if (resendingDeliveryKey || emailDeliveryGroups.length === 0) return;

    setResendingDeliveryKey("__all__");
    const total = { sent: 0, failed: 0, skipped: 0 };
    try {
      for (const group of emailDeliveryGroups) {
        const result = await apiFetch<ManualReminderResult & { skippedAlreadySent?: number }>("/meter-readings/reminders/resend-missing", {
          method: "POST",
          body: JSON.stringify({
            deliveryKey: group.key,
            language: locale,
          }),
        });
        total.sent += result.sent;
        total.failed += result.failed;
        total.skipped += result.skippedNoEmail + result.skippedSubmitted + (result.skippedAlreadySent ?? 0);
      }
      notify.success(t("emailDeliveryResendResult", total));
      await loadEmailStats();
    } catch (error) {
      console.error("Failed to resend all automatic reminders", error);
      notify.error(error instanceof Error ? error.message : t("emailDeliveryResendFailed"));
    } finally {
      setResendingDeliveryKey(null);
    }
  }, [emailDeliveryGroups, loadEmailStats, locale, notify, resendingDeliveryKey, t]);

  const toggleEmailDeliveryGroup = React.useCallback((key: string) => {
    setExpandedEmailDeliveryGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  React.useEffect(() => {
    if ((hasWaterTab || hasElectricityTab) && activeTab !== effectiveTab) {
      setActiveTab(effectiveTab);
      setExpandedApartments(new Set());
    }
  }, [activeTab, effectiveTab, hasElectricityTab, hasWaterTab]);

  React.useEffect(() => {
    if (periodAvailableTabs.length > 0 && periodTab !== effectivePeriodTab) {
      setPeriodTab(effectivePeriodTab);
    }
  }, [effectivePeriodTab, periodAvailableTabs.length, periodTab]);

  const filteredApartments = apartments
    .map((item) => ({
      ...item,
      meters: item.meters.filter((meter) => meterMatchesTab(meter, effectiveTab)),
    }))
    .filter((item) => {
      if (item.meters.length === 0) return false;
      if (effectiveBuilding && item.building !== effectiveBuilding) return false;
      if (searchQuery && !item.apartment.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (statusFilter === "all") return true;

      // Фильтр статуса должен смотреть только на счётчики активной вкладки,
      // иначе квартира может попасть в список по электричеству, а отображаться по воде.
      const dates = item.meters
        .map((m) => m.latestReading?.submittedAt)
        .filter((d): d is string => Boolean(d) && d !== "â€”");
      const latestDate = dates.length > 0 ? dates.sort().reverse()[0] : "â€”";
      const monthKeys = item.meters
        .map((m) => readingMonthKey(m.latestReading))
        .filter(Boolean);
      const latestMonthKey = monthKeys.length > 0 ? monthKeys.sort().reverse()[0] : undefined;
      const periodStatus = getPeriodStatus(latestDate, latestMonthKey);
      if (statusFilter === "pending") return periodStatus === "pending";
      if (statusFilter === "overdue") return periodStatus === "overdue";
      if (statusFilter === "submitted") return periodStatus === "submitted";
      if (statusFilter === "verified") {
        return item.meters.some((m) => m.latestReading?.status === "verified");
      }
      return false;
    });

  const buildingApartments = buildingScopedApartments
    .map((item) => ({
      ...item,
      meters: item.meters.filter((meter) => meterMatchesTab(meter, effectiveTab)),
    }))
    .filter((item) => item.meters.length > 0);
  const buildingWaterSummaries = waterSummariesForApartments(buildingApartments);
  const buildingWaterSummary = buildingWaterSummaries[0] ?? null;

  const handleExportReadings = () => {
    const exportRows = filteredApartments.flatMap((apt) =>
      apt.meters.flatMap((meter) => {
        const readings = meter.readings.length > 0
          ? meter.readings
          : meter.latestReading
            ? [meter.latestReading]
            : [];

        return readings
          .filter((reading) => readingMonthKey(reading) === exportReadingMonth)
          .map((reading) => ({
            building: apt.buildingLabel || buildingLabels.get(apt.building) || apt.building,
            apartmentId: apt.apartmentId,
            apartment: apt.apartment,
            meterType: meter.meterType,
            serialNumber: meter.serialNumber || "",
            period: readingMonthLabel(reading) ?? "",
            submittedAt: reading.submittedAt || "",
            previousValue: reading.previousValue || "",
            currentValue: reading.currentValue || "",
            consumption: readingConsumption(reading),
            status: reading.status || "",
          }));
      }),
    );

    if (exportRows.length === 0) {
      notify.info(t("notifyNothingToExport"));
      return;
    }

    exportRows.sort((left, right) => {
      const apartmentSort = left.apartment.localeCompare(right.apartment, undefined, { numeric: true, sensitivity: "base" });
      if (apartmentSort !== 0) return apartmentSort;
      return left.meterType.localeCompare(right.meterType);
    });

    const tableRows = [
      [
        t("selectBuilding"),
        t("colApartment"),
        t("colMeter"),
        t("meterNumber"),
        t("monthLabel"),
        t("colDate"),
        t("colPrevious"),
        t("colCurrent"),
        t("colConsumption"),
        t("colStatus"),
      ],
      ...exportRows.map((row) => [
        row.building,
        row.apartment,
        row.meterType,
        row.serialNumber,
        row.period,
        row.submittedAt,
        row.previousValue,
        row.currentValue,
        row.consumption,
        row.status,
      ]),
    ];

    const fileBase = `domera-meter-readings-${exportReadingMonth}`;
    if (exportFormat === "xml") {
      const [invoiceYear, invoiceMonth] = exportInvoiceMonth.split("-");
      const buildingName = buildingLabels.get(effectiveBuilding) || exportRows[0]?.building || "";
      const xmlRows = exportRows
        .map((row) => `    <R>
      <DzNumurs>${xmlCell(row.apartment)}</DzNumurs>
      <DzForeignKey>${xmlCell(row.apartment)}</DzForeignKey>
      <SkdNrM>${xmlCell(row.serialNumber)}</SkdNrM>
      <BeigMNor>${xmlCell(row.currentValue)}</BeigMNor>
      <Tips>${xmlCell(row.meterType)}</Tips>
      <RadijumaMenesis>${xmlCell(exportReadingMonth)}</RadijumaMenesis>
    </R>`)
        .join("\n");
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<UdSkRd xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Gads>${xmlCell(invoiceYear)}</Gads>
  <Menesis>${xmlCell(Number(invoiceMonth))}</Menesis>
  <Nosaukums>${xmlCell(buildingName)}</Nosaukums>
  <Tab>
${xmlRows}
  </Tab>
</UdSkRd>`;
      downloadText(`${fileBase}.xml`, xml, "application/xml;charset=utf-8;");
    } else if (exportFormat === "excel") {
      downloadText(`${fileBase}.xls`, toExcelHtml(tableRows), "application/vnd.ms-excel;charset=utf-8;");
    } else {
      downloadText(`${fileBase}.csv`, toCsv(tableRows), "text/csv;charset=utf-8;");
    }

    setExportOpen(false);
    notify.success(t("notifyExportSuccess"));
  };

  const renderMonthControl = (
    label: string,
    value: string,
    onChange: (value: string) => void,
  ) => {
    return (
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</label>
        <input
          type="month"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
        />
      </div>
    );
  };

  const toggleExpanded = (id: string) => {
    setExpandedApartments((current) => (current.has(id) ? new Set() : new Set([id])));
  };

  const toggleMonth = (monthKey: string) => {
    const key = `month-${monthKey}`;
    const newExpanded = new Set(expandedApartments);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedApartments(newExpanded);
  };
  return (
    <div className="space-y-6">
      <Modal
        open={periodOpen}
        onClose={() => setPeriodOpen(false)}
        title={t("periodModalTitle")}
        size="lg"
      >
        {periodAvailableTabs.length > 1 ? (
          <div className="mb-4 flex flex-wrap gap-2 border-b border-slate-100 pb-4">
            {periodAvailableTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setPeriodTab(tab)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                effectivePeriodTab === tab
                  ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {tab === "water" ? t("water") : t("electricity")}
            </button>
            ))}
          </div>
        ) : null}
        <div className="hidden rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <div className={`${emailDeliveryOpen ? "mb-3" : ""} flex flex-wrap items-center justify-between gap-3`}>
            <button
              type="button"
              onClick={() => setEmailDeliveryOpen((value) => !value)}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-1 py-1 text-left transition hover:bg-white/70"
            >
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition ${emailDeliveryOpen ? "rotate-90" : ""}`}>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t("emailStatsTitle")}</span>
                <span className="block truncate text-sm text-slate-600">
                  {emailStatsLoading
                    ? t("emailStatsLoading")
                    : emailStats?.lastSentAt
                      ? t("emailStatsLastSent", { date: new Date(emailStats.lastSentAt).toLocaleString(locale) })
                      : t("emailStatsSubtitle")}
                </span>
              </span>
            </button>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => sendManualReminder()}
                disabled={!effectiveBuilding || manualReminderSending}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m22 2-7 20-4-9-9-4Z" />
                  <path d="M22 2 11 13" />
                </svg>
                {manualReminderSending ? t("manualReminderSending") : t("manualReminderSend")}
              </button>
              <button
                type="button"
                onClick={() => loadEmailStats()}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <svg className={`h-4 w-4 ${emailStatsLoading ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                  <path d="M3 21v-5h5" />
                  <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                  <path d="M21 3v5h-5" />
                </svg>
                {t("emailStatsRefresh")}
              </button>
            </div>
          </div>
          {emailDeliveryOpen ? (
            <>
          <div className="grid gap-2 sm:grid-cols-4">
            {[
              { label: t("emailStatsTotal"), value: emailStats?.total ?? 0, className: "text-slate-900" },
              { label: t("emailStatsSuccess"), value: emailStats?.success ?? 0, className: "text-emerald-700" },
              { label: t("emailStatsErrors"), value: emailStats?.error ?? 0, className: "text-rose-700" },
              { label: t("emailStatsLast30Days"), value: emailStats?.last30Days?.total ?? 0, className: "text-blue-700" },
            ].map((item) => (
              <div key={item.label} className="rounded-md border border-slate-200 bg-white px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{item.label}</div>
                <div className={`mt-0.5 text-xl font-bold tabular-nums ${item.className}`}>{item.value}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 text-xs font-medium text-slate-500">
            {emailStats?.lastSentAt
              ? t("emailStatsLastSent", { date: new Date(emailStats.lastSentAt).toLocaleString(locale) })
              : t("emailStatsNoSent")}
          </div>
          <div className="mt-4 overflow-hidden rounded-md border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {t("emailDeliveryListTitle")}
              </div>
              <div className="text-xs font-medium text-slate-500">
                {t("emailDeliveryListCount", { count: emailDeliveries.length })}
              </div>
            </div>
            {emailDeliveries.length > 0 ? (
              <div className="max-h-64 overflow-auto">
                <table className="min-w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-semibold">{t("emailDeliveryApartment")}</th>
                      <th className="px-3 py-2 font-semibold">{t("emailDeliveryEmail")}</th>
                      <th className="px-3 py-2 font-semibold">{t("emailDeliveryStatus")}</th>
                      <th className="px-3 py-2 font-semibold">{t("emailDeliveryTime")}</th>
                      <th className="px-3 py-2 font-semibold">{t("emailDeliveryError")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {emailDeliveries.map((item) => {
                      const apartmentLabel = item.apartmentId
                        ? apartments.find((apartment) => apartment.id === item.apartmentId || apartment.apartmentId === item.apartmentId)?.apartment
                        : "";
                      return (
                        <tr key={item.id} className="align-top">
                          <td className="px-3 py-2 font-medium text-slate-700">{apartmentLabel || item.apartmentId || "—"}</td>
                          <td className="px-3 py-2 text-slate-600">{item.to || "—"}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              item.status === "success"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-rose-50 text-rose-700"
                            }`}>
                              {item.status === "success" ? t("emailDeliverySuccess") : t("emailDeliveryFailed")}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-500">
                            {item.createdAt ? new Date(item.createdAt).toLocaleString(locale) : "—"}
                          </td>
                          <td className="max-w-[220px] px-3 py-2 text-rose-700">
                            {item.errorMessage || "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-3 py-4 text-sm text-slate-500">
                {emailStatsLoading ? t("emailStatsLoading") : t("emailDeliveryListEmpty")}
              </div>
            )}
          </div>
            </>
          ) : null}
        </div>
        <SubmissionPeriodCard
          key={`${effectiveBuilding}:${effectivePeriodTab}`}
          bare
          hideHeader
          buildingLabel={effectivePeriodTab === "water" ? t("water") : t("electricity")}
          value={periodValues[effectivePeriodTab]}
          onSave={(value) => canManageReadings ? savePeriodFor(effectivePeriodTab, value) : undefined}
          onDelete={canManageReadings ? () => deletePeriodFor(effectivePeriodTab) : undefined}
          saving={periodSaving}
          deleting={periodDeleting}
          locale={locale}
          labels={{
            startDate: t("periodStartDate"),
            endDate: t("periodEndDate"),
            monthly: t("periodMonthlyCheckbox"),
            freeMode: t("periodFreeMode"),
            dateMode: t("periodDateMode"),
            freeModeHint: t("periodFreeModeHint"),
            monthlyHint: (startDay, endDay) => t("periodMonthlyHint", { startDay, endDay }),
            save: t("save"),
            saving: t("saving"),
            delete: t("deletePeriod"),
            deleting: t("deletingPeriod"),
            remindersTitle: t("periodRemindersTitle"),
            remindersEnabled: t("periodRemindersEnabled"),
            reminderOnStart: t("periodReminderOnStart"),
            reminderOnEnd: t("periodReminderOnEnd"),
            reminderOnClose: t("periodReminderOnClose"),
            reminderStartTime: t("periodReminderStartTime"),
            reminderEndTime: t("periodReminderEndTime"),
            reminderCloseTime: t("periodReminderCloseTime"),
            reminderOffsetDays: t("periodReminderOffsetDays"),
            reminderEndOffsetPrefix: t("periodReminderEndOffsetPrefix"),
            reminderEndOffsetSuffix: t("periodReminderEndOffsetSuffix"),
            reminderItemColumn: t("periodReminderItemColumn"),
            reminderTimeColumn: t("periodReminderTimeColumn"),
          }}
          beforeActions={
            <div className="mt-5">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <div className={`${emailDeliveryOpen ? "mb-3" : ""} flex flex-wrap items-center justify-between gap-3`}>
                  <button
                    type="button"
                    onClick={() => setEmailDeliveryOpen((value) => !value)}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-1 py-1 text-left transition hover:bg-white/70"
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition ${emailDeliveryOpen ? "rotate-90" : ""}`}>
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t("emailStatsTitle")}</span>
                      <span className="block truncate text-sm text-slate-600">
                        {emailStatsLoading
                          ? t("emailStatsLoading")
                          : emailStats?.lastSentAt
                            ? t("emailStatsLastSent", { date: new Date(emailStats.lastSentAt).toLocaleString(locale) })
                            : t("emailStatsSubtitle")}
                      </span>
                    </span>
                  </button>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => sendManualReminder()}
                      disabled={!effectiveBuilding || manualReminderSending}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m22 2-7 20-4-9-9-4Z" />
                        <path d="M22 2 11 13" />
                      </svg>
                      {manualReminderSending ? t("manualReminderSending") : t("manualReminderSend")}
                    </button>
                    <button
                      type="button"
                      onClick={() => loadEmailStats()}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <svg className={`h-4 w-4 ${emailStatsLoading ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                        <path d="M3 21v-5h5" />
                        <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                        <path d="M21 3v5h-5" />
                      </svg>
                      {t("emailStatsRefresh")}
                    </button>
                  </div>
                </div>
                {emailDeliveryOpen ? (
                  <>
                    <div className="hidden">
                      {[
                        { label: t("emailStatsTotal"), value: emailStats?.total ?? 0, className: "text-slate-900" },
                        { label: t("emailStatsSuccess"), value: emailStats?.success ?? 0, className: "text-emerald-700" },
                        { label: t("emailStatsErrors"), value: emailStats?.error ?? 0, className: "text-rose-700" },
                        { label: t("emailStatsLast30Days"), value: emailStats?.last30Days?.total ?? 0, className: "text-blue-700" },
                      ].map((item) => (
                        <div key={item.label} className="rounded-md border border-slate-200 bg-white px-3 py-2">
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{item.label}</div>
                          <div className={`mt-0.5 text-xl font-bold tabular-nums ${item.className}`}>{item.value}</div>
                        </div>
                      ))}
                    </div>
                    <div className="hidden">
                      {emailStats?.lastSentAt
                        ? t("emailStatsLastSent", { date: new Date(emailStats.lastSentAt).toLocaleString(locale) })
                        : t("emailStatsNoSent")}
                    </div>
                    <div className="mt-4 overflow-hidden rounded-md border border-slate-200 bg-white">
                      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          {t("emailDeliveryListTitle")}
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <div className="text-xs font-medium text-slate-500">
                            {t("emailDeliveryListCount", { count: emailDeliveryGroups.length })}
                          </div>
                          <button
                            type="button"
                            onClick={() => resendAllMissingAutoReminders()}
                            disabled={Boolean(resendingDeliveryKey) || emailDeliveryGroups.length === 0}
                            className="inline-flex h-8 items-center justify-center rounded-md border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {resendingDeliveryKey === "__all__" ? t("emailDeliveryResending") : t("emailDeliveryResendAllMissing")}
                          </button>
                        </div>
                      </div>
                      {emailDeliveryGroups.length > 0 ? (
                        <div className="max-h-64 overflow-auto">
                          <table className="min-w-full text-left text-xs">
                            <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                              <tr>
                                <th className="px-3 py-2 font-semibold">{t("emailDeliveryReminder")}</th>
                                <th className="px-3 py-2 font-semibold">{t("emailDeliverySent")}</th>
                                <th className="px-3 py-2 font-semibold">{t("emailDeliveryErrors")}</th>
                                <th className="px-3 py-2 font-semibold">{t("emailDeliveryTime")}</th>
                                <th className="px-3 py-2 font-semibold">{t("emailDeliveryAction")}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {emailDeliveryGroups.map((group) => {
                                const isResending = resendingDeliveryKey === group.key;
                                const isExpanded = expandedEmailDeliveryGroups.has(group.key);
                                const recipientRows = emailDeliveryRowsForGroup(group.key);
                                return (
                                  <React.Fragment key={group.key}>
                                    <tr className="align-top">
                                      <td className="px-3 py-2">
                                        <button
                                          type="button"
                                          onClick={() => toggleEmailDeliveryGroup(group.key)}
                                          className="flex min-w-0 items-start gap-2 text-left"
                                        >
                                          <span className={`mt-0.5 text-slate-400 transition ${isExpanded ? "rotate-90" : ""}`}>
                                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                              <path d="m9 18 6-6-6-6" />
                                            </svg>
                                          </span>
                                          <span>
                                            <span className="block font-semibold text-slate-700">
                                              {group.utility === "water" ? t("water") : t("electricity")} · {t(`emailDeliveryStage_${group.stage}`)}
                                            </span>
                                            <span className="mt-0.5 block text-slate-500">{group.date}</span>
                                          </span>
                                        </button>
                                      </td>
                                      <td className="px-3 py-2">
                                        <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                          {group.success}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2">
                                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                          group.error > 0 ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-500"
                                        }`}>
                                          {group.error}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2 text-slate-500">
                                        {group.lastAt ? new Date(group.lastAt).toLocaleString(locale) : "—"}
                                      </td>
                                      <td className="px-3 py-2">
                                        <button
                                          type="button"
                                          onClick={() => resendMissingAutoReminder(group.key)}
                                          disabled={Boolean(resendingDeliveryKey)}
                                          className="inline-flex h-8 items-center justify-center rounded-md border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                          {isResending ? t("emailDeliveryResending") : t("emailDeliveryResendMissing")}
                                        </button>
                                      </td>
                                    </tr>
                                    {isExpanded ? (
                                      <tr>
                                        <td colSpan={5} className="bg-slate-50 px-3 py-3">
                                          <div className="mb-2 flex flex-wrap gap-1.5">
                                            {[
                                              { value: "all" as const, label: t("emailDeliveryFilterAll") },
                                              { value: "missing" as const, label: t("emailDeliveryFilterMissing") },
                                              { value: "error" as const, label: t("emailDeliveryFilterErrors") },
                                              { value: "success" as const, label: t("emailDeliveryFilterSuccess") },
                                            ].map((filter) => (
                                              <button
                                                key={filter.value}
                                                type="button"
                                                onClick={() => setEmailRecipientFilter(filter.value)}
                                                className={`h-8 rounded-md border px-2.5 text-[11px] font-semibold transition ${
                                                  emailRecipientFilter === filter.value
                                                    ? "border-blue-500 bg-blue-50 text-blue-700"
                                                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                                                }`}
                                              >
                                                {filter.label}
                                              </button>
                                            ))}
                                          </div>
                                          <div className="max-h-56 overflow-auto rounded-md border border-slate-200 bg-white">
                                            <table className="min-w-full text-left text-xs">
                                              <thead className="sticky top-0 bg-white text-[10px] uppercase tracking-wide text-slate-500">
                                                <tr>
                                                  <th className="px-3 py-2 font-semibold">{t("emailDeliveryApartment")}</th>
                                                  <th className="px-3 py-2 font-semibold">{t("emailDeliveryEmail")}</th>
                                                  <th className="px-3 py-2 font-semibold">{t("emailDeliveryStatus")}</th>
                                                  <th className="px-3 py-2 font-semibold">{t("emailDeliveryTime")}</th>
                                                  <th className="px-3 py-2 font-semibold">{t("emailDeliveryError")}</th>
                                                </tr>
                                              </thead>
                                              <tbody className="divide-y divide-slate-100">
                                                {recipientRows.map((item) => {
                                                  return (
                                                    <tr key={item.id} className="align-top">
                                                      <td className="px-3 py-2 font-medium text-slate-700">{item.apartment || "—"}</td>
                                                      <td className="px-3 py-2 text-slate-600">{item.email || "—"}</td>
                                                      <td className="px-3 py-2">
                                                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                                          item.status === "success"
                                                            ? "bg-emerald-50 text-emerald-700"
                                                            : item.status === "error"
                                                              ? "bg-rose-50 text-rose-700"
                                                              : "bg-amber-50 text-amber-700"
                                                        }`}>
                                                          {item.status === "success"
                                                            ? t("emailDeliverySuccess")
                                                            : item.status === "error"
                                                              ? t("emailDeliveryFailed")
                                                              : t("emailDeliveryMissing")}
                                                        </span>
                                                      </td>
                                                      <td className="px-3 py-2 text-slate-500">
                                                        {item.createdAt ? new Date(item.createdAt).toLocaleString(locale) : "—"}
                                                      </td>
                                                      <td className="max-w-[220px] px-3 py-2 text-rose-700">
                                                        {item.errorMessage || "—"}
                                                      </td>
                                                    </tr>
                                                  );
                                                })}
                                                {recipientRows.length === 0 ? (
                                                  <tr>
                                                    <td colSpan={5} className="px-3 py-4 text-center text-sm text-slate-500">
                                                      {t("emailDeliveryFilterEmpty")}
                                                    </td>
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
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="px-3 py-4 text-sm text-slate-500">
                          {emailStatsLoading ? t("emailStatsLoading") : t("emailDeliveryListEmpty")}
                        </div>
                      )}
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          }
        />
      </Modal>

      <Modal
        open={submitOpen}
        onClose={() => setSubmitOpen(false)}
        title={t("submitModalTitle")}
        size="md"
        footer={
          <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <Button variant="primary" onClick={() => setSubmitOpen(false)} className="min-h-12 rounded-xl px-3 text-sm sm:px-5">
              {t("close")}
            </Button>
            <Button
              variant="primary"
              onClick={() => void submitReadings()}
              disabled={submitting || !canManageReadings}
              className="min-h-12 rounded-xl bg-emerald-600 px-3 text-sm hover:bg-emerald-700 sm:px-5"
            >
              {submitting ? t("sending") : submitHasExistingReadings ? t("editReadings") : t("send")}
            </Button>
          </div>
        }
      >
        {submitApt && (
          <div className="space-y-4">
            <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("selectApartmentLabel")}</label>
              <div ref={submitApartmentSelectorRef} className="relative">
                <button
                  type="button"
                  onClick={() => setSubmitApartmentSelectorOpen((open) => !open)}
                  className={`flex h-11 w-full items-center justify-between gap-3 rounded-xl border bg-slate-50 px-3 text-left text-sm text-slate-800 outline-none transition ${
                    submitApartmentSelectorOpen
                      ? "border-blue-500 ring-2 ring-blue-500/30"
                      : "border-slate-300 hover:border-slate-400"
                  }`}
                  aria-haspopup="listbox"
                  aria-expanded={submitApartmentSelectorOpen}
                >
                  <span className="min-w-0 truncate">{submitApt.apartment}</span>
                  <svg
                    className={`h-4 w-4 shrink-0 text-slate-500 transition ${submitApartmentSelectorOpen ? "rotate-180" : ""}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                {submitApartmentSelectorOpen ? (
                  <div
                    role="listbox"
                    className="mt-2 max-h-52 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg shadow-slate-900/10"
                  >
                    {filteredApartments.map((apt) => {
                      const selected = apt.apartmentId === submitApt.apartmentId;
                      return (
                        <button
                          key={apt.apartmentId}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onClick={() => {
                            setSubmitApt(apt);
                            setSubmitApartmentSelectorOpen(false);
                          }}
                          className={`flex min-h-9 w-full items-center rounded-lg px-3 text-left text-sm transition ${
                            selected
                              ? "bg-blue-50 font-semibold text-blue-700"
                              : "text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          <span className="truncate">{apt.apartment}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("monthLabel")}</label>
              <div className="grid grid-cols-[minmax(0,1fr)_5.75rem] gap-2">
                <select
                  value={submitMonthParts.month}
                  onChange={(e) => setSubmitMonth(`${submitMonthParts.year}-${e.target.value}`)}
                  className="h-11 min-w-0 rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                >
                  {submitMonthOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  value={submitMonthParts.year}
                  onChange={(e) => setSubmitMonth(`${e.target.value}-${submitMonthParts.month}`)}
                  className="h-11 min-w-0 rounded-xl border border-slate-300 bg-slate-50 px-2 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                >
                  {submitYearOptions.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            </div>

            {(() => {
              const { cold, hot, electricity } = submitMeters;
              const [yearStr, monthStr] = submitMonth.split("-");
              const currentPeriodLabel = `${monthStr}.${yearStr}`;
              const coldPreviousReading = previousReadingForMonth(cold, submitMonth);
              const hotPreviousReading = previousReadingForMonth(hot, submitMonth);
              const electricityPreviousReading = previousReadingForMonth(electricity, submitMonth);
              return (
                <div className="space-y-4">
                  {cold && (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 sm:p-4">
                    <MeterReadingInput
                      variant="cold"
                      label={t("coldWater")}
                      serialNumber={cold.serialNumber}
                      previousValue={previousReadingValue(coldPreviousReading)}
                      previousPeriod={readingMonthLabel(coldPreviousReading)}
                      currentPeriod={currentPeriodLabel}
                      value={submitCold}
                      onChange={setSubmitCold}
                      size="compact"
                      labels={{ previous: t("previousReading"), current: t("currentReading"), serialPrefix: t("serialPrefix") }}
                    />
                    </div>
                  )}
                  {hot && (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 sm:p-4">
                    <MeterReadingInput
                      variant="hot"
                      label={t("hotWater")}
                      serialNumber={hot.serialNumber}
                      previousValue={previousReadingValue(hotPreviousReading)}
                      previousPeriod={readingMonthLabel(hotPreviousReading)}
                      currentPeriod={currentPeriodLabel}
                      value={submitHot}
                      onChange={setSubmitHot}
                      size="compact"
                      labels={{ previous: t("previousReading"), current: t("currentReading"), serialPrefix: t("serialPrefix") }}
                    />
                    </div>
                  )}
                  {electricity && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3 sm:p-4">
                    <MeterReadingInput
                      variant="electricity"
                      label={t("electricity")}
                      serialNumber={electricity.serialNumber}
                      previousValue={previousReadingValue(electricityPreviousReading)}
                      previousPeriod={readingMonthLabel(electricityPreviousReading)}
                      currentPeriod={currentPeriodLabel}
                      value={submitElectricity}
                      onChange={setSubmitElectricity}
                      intDigits={Math.min(7, Math.max(5, electricity.meterDigits ?? 6))}
                      decDigits={0}
                      size="compact"
                      labels={{ previous: t("previousReading"), current: t("currentReading"), serialPrefix: t("serialPrefix") }}
                    />
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </Modal>

      <AlertModal
        open={confirmEditReadingsOpen}
        onClose={() => setConfirmEditReadingsOpen(false)}
        title={t("confirmEditReadingsTitle")}
        variant="warning"
        confirmLabel={t("editReadings")}
        cancelLabel={t("cancel")}
        onConfirm={() => void submitReadings(true)}
      >
        {t("confirmEditReadings")}
      </AlertModal>

      <Modal
        open={viewOpen}
        onClose={() => setViewOpen(false)}
        title={t("viewModalTitle")}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setViewOpen(false)}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              {t("cancel")}
            </button>
            {canManageReadings ? (
            <Button variant="primary" onClick={saveViewDates} disabled={viewSaving}>
              {viewSaving ? t("saving") : t("save")}
            </Button>
            ) : null}
          </div>
        }
      >
        {viewApt && (
          <div className="space-y-4">
            <p className="-mt-1 text-xs text-slate-400">{t("pressEscToClose")}{viewLoading ? ` · ${t("loadingShort")}` : ""}</p>
            {viewApt.meters.map((m) => {
              const isHot = m.meterKey === "hotmeterwater" || m.meterType.toLowerCase().includes("hot");
              const isElectricity = isElectricityMeter(m);
              const dot = isElectricity ? "bg-amber-400" : isHot ? "bg-rose-500" : "bg-blue-500";
              const label = isElectricity ? t("electricity") : isHot ? t("hotWaterFull") : t("coldWaterFull");
              const slot: "cold" | "hot" | "electricity" = isElectricity ? "electricity" : isHot ? "hot" : "cold";
              const key = m.meterKey ?? m.serialNumber ?? m.meterType;
              return (
                <div key={key} className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
                  <div className="mb-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                    <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
                    <span className="text-sm font-medium text-slate-800">{label}</span>
                  </div>
                  <div className="mb-3">
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("meterNumber")}</label>
                    <input
                      type="text"
                      value={viewSerials[slot]}
                      onChange={(e) => setViewSerials((prev) => ({ ...prev, [slot]: e.target.value }))}
                      placeholder={t("meterNumber")}
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("checkDate")}</label>
                    <input
                      type="date"
                      value={viewDates[slot]}
                      onChange={(e) => setViewDates((prev) => ({ ...prev, [slot]: e.target.value }))}
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Modal>

      {/* Select Apartment Modal */}
      <Modal
        open={selectAptOpen}
        onClose={() => setSelectAptOpen(false)}
        title={t("selectAptModalTitle")}
        size="md"
      >
        <div className="space-y-4">
          <select
            value={selectAptValue}
            onChange={(e) => {
              const value = e.target.value;
              setSelectAptValue(value);
              if (value) {
                const apt = filteredApartments.find(a => a.apartmentId === value);
                if (apt) {
                  setSelectAptOpen(false);
                  openSubmitModal(apt);
                }
              }
            }}
            className="w-full px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent"
          >
            <option value="">{t("selectApartmentPlaceholder")}</option>
            {filteredApartments.map((apt) => (
              <option key={apt.apartmentId} value={apt.apartmentId}>
                {apt.apartment}
              </option>
            ))}
          </select>
        </div>
      </Modal>

      <Modal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title={t("exportModalTitle")}
        size="sm"
      >
        <div className="space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">{t("exportFormatLabel")}</label>
            <select
              value={exportFormat}
              onChange={(event) => setExportFormat(event.target.value as ExportFormat)}
              className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
            >
              <option value="csv">CSV</option>
              <option value="excel">Excel (XLS)</option>
              <option value="xml">XML</option>
            </select>
          </div>

          {renderMonthControl(t("exportReadingMonthLabel"), exportReadingMonth, setExportReadingMonth)}
          {exportFormat === "xml" ? renderMonthControl(t("exportInvoiceMonthLabel"), exportInvoiceMonth, setExportInvoiceMonth) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              type="button"
              variant="primary"
              onClick={handleExportReadings}
              className="rounded-xl bg-emerald-600 px-5 hover:bg-emerald-700"
            >
              {t("exportDownload", { format: exportFormat === "excel" ? "XLS" : exportFormat.toUpperCase() })}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setExportOpen(false)}
              className="rounded-xl"
            >
              {t("cancel")}
            </Button>
          </div>
        </div>
      </Modal>

      <section> 
        {buildings.length > 1 && (
          <div className="mb-5 max-w-md">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t("selectBuilding")}
            </label>
            <select
              value={effectiveBuilding}
              onChange={(event) => setFilterValue("building", event.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none transition hover:border-slate-300 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            >
              {buildings.map((building) => (
                <option key={building} value={building}>
                  {buildingLabels.get(building) || building}
                </option>
              ))}
            </select>
            {!selectedBuildingHasNoApartments && (
              <p className="mt-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                {filteredApartments.length > 0 ? (
                <>
                  <span className="text-slate-900">{filteredApartments.length}</span>
                  {` ${t("apts")}`}
                </>
              ) : (
                t("noData")
              )}
              </p>
            )}
          </div>
        )}
        {selectedBuildingHasNoApartments ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center">
            <p className="text-base font-semibold text-slate-800">{t("apartmentsNotAdded")}</p>
            <div className="mt-4">
              <Link
                href={ROUTES.apartments}
                className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                {t("apartmentsButton")}
              </Link>
            </div>
          </div>
        ) : (
          <FilterBar
            fields={filterFields}
            values={{ ...filterValues, building: effectiveBuilding }}
            onChange={setFilterValue}
            mobileActionsInline
            actionsClassName="flex w-full items-center justify-end gap-2 md:w-auto md:flex-nowrap"
            actions={
              <>
                {canManageReadings ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPeriodTab(periodOpenTab);
                      setPeriodOpen(true);
                    }}
                    disabled={!effectiveBuilding || periodAvailableTabs.length === 0}
                    className="hidden items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 md:inline-flex"
                    title={periodActionLabel}
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" />
                      <path d="M16 2v4M8 2v4M3 10h18" />
                    </svg>
                    {periodActionLabel}
                    {periodValue?.monthly && (
                      <svg className="h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="ежемесячно">
                        <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
                        <path d="M21 3v5h-5" />
                      </svg>
                    )}
                  </button>
                ) : null}
                {canManageReadings ? (
                  <button
                    type="button"
                    onClick={() => setSelectAptOpen(true)}
                    disabled={filteredApartments.length === 0}
                    className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-1"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                    {t("submit")}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setExportOpen(true)}
                  disabled={filteredApartments.length === 0}
                  className="hidden items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-1 focus:ring-slate-400 md:inline-flex"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                  {t("export")}
                </button>
                <div ref={mobileActionsRef} className="relative flex h-11 w-11 shrink-0 items-center justify-end md:hidden">
                  {mobileActionsOpen && (
                    <div className="absolute right-0 top-[calc(100%+0.5rem)] z-20 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 text-sm shadow-xl shadow-slate-950/10">
                      {canManageReadings ? (
                        <button
                          type="button"
                          onClick={() => {
                            setMobileActionsOpen(false);
                            setPeriodTab(periodOpenTab);
                            setPeriodOpen(true);
                          }}
                          disabled={!effectiveBuilding || periodAvailableTabs.length === 0}
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                          title={periodActionLabel}
                        >
                          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" />
                            <path d="M16 2v4M8 2v4M3 10h18" />
                          </svg>
                          {periodActionLabel}
                        </button>
                      ) : null}
                      {canManageReadings ? (
                        <button
                          type="button"
                          onClick={() => {
                            setMobileActionsOpen(false);
                            setSelectAptOpen(true);
                          }}
                          disabled={filteredApartments.length === 0}
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                          {t("submit")}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          setMobileActionsOpen(false);
                          setExportOpen(true);
                        }}
                        disabled={filteredApartments.length === 0}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                        {t("export")}
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setMobileActionsOpen((open) => !open)}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm shadow-slate-950/[0.03] transition hover:border-slate-300 hover:bg-slate-50"
                    aria-label={t("colActions")}
                    aria-expanded={mobileActionsOpen}
                  >
                    <svg className="h-5 w-5 rotate-90" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <circle cx="5" cy="12" r="1.8" />
                      <circle cx="12" cy="12" r="1.8" />
                      <circle cx="19" cy="12" r="1.8" />
                    </svg>
                  </button>
                </div>
              </>
            }
            footer={
              <>
                <span className="font-semibold text-slate-700">{filteredApartments.length}</span>{" "}
                {filteredApartments.length === 1 ? t("readingsCount", { count: 1 }) : t("readingsCountPlural", { count: filteredApartments.length })}
              </>
            }
          />
        )}

        {!selectedBuildingHasNoApartments && availableTabs.length > 1 ? (
          <div className="mb-4 inline-flex rounded-xl bg-slate-100 p-1">
            {availableTabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setActiveTab(tab);
                  setExpandedApartments(new Set());
                }}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  effectiveTab === tab
                    ? tab === "electricity"
                      ? "bg-amber-400 text-slate-950 shadow-sm"
                      : "bg-blue-600 text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {tab === "electricity" ? t("electricity") : t("water")}
              </button>
            ))}
          </div>
        ) : null}

        {!selectedBuildingHasNoApartments && effectiveTab === "water" && effectiveBuilding && renderBuildingStatsPanel(buildingWaterSummary, effectiveBuilding)}

        {/* Table */}
        {loading ? (
          <div className="rounded-md border border-slate-200 bg-white p-10 text-center">
            <div className="inline-flex items-center gap-3 text-sm text-slate-600">
              <div className="animate-spin h-4 w-4 border-2 border-slate-400 border-r-transparent rounded-full"></div>
              {t("loadingReadings")}
            </div>
          </div>
        ) : error ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-6">
            <div className="mb-2 text-sm font-semibold text-red-800">{t("errorTitle")}</div>
            <div className="mb-4 text-sm text-red-700">{error}</div>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              {t("retry")}
            </button>
          </div>
        ) : selectedBuildingHasNoApartments ? null : filteredApartments.length > 0 ? (
          <>
          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {filteredApartments.map((apt) => {
              const isExpanded = expandedApartments.has(apt.id);
              const dates = apt.meters
                .map((m) => m.latestReading?.submittedAt)
                .filter((d): d is string => Boolean(d) && d !== "—");
              const latestDate = dates.length > 0 ? dates.sort().reverse()[0] : "—";
              const monthKeys = apt.meters
                .map((m) => readingMonthKey(m.latestReading))
                .filter(Boolean);
              const latestMonthKey = monthKeys.length > 0 ? monthKeys.sort().reverse()[0] : undefined;
              const cfg = STATUS_CFG[getPeriodStatus(latestDate, latestMonthKey)];
              const submittedDate = submittedDateLabel(latestDate);
              return (
                <div key={apt.id} className="rounded-md border border-slate-200 bg-white">
                  <button
                    onClick={() => toggleExpanded(apt.id)}
                    className="grid w-full grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-2 px-3 py-3 text-left"
                  >
                    <svg className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isExpanded ? "rotate-90" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                    <span className="text-base font-semibold text-slate-900 tabular-nums">{apt.apartment}</span>
                    <span className="ml-auto flex min-w-0 flex-col items-end gap-1 rounded-xl  px-2.5 py-1.5">
                      <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${cfg.bg} ${cfg.border} ${cfg.text}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                        {cfg.label}
                      </span>
                      {submittedDate && (
                        <span className="max-w-[8.5rem] truncate text-[11px] font-medium text-slate-500 tabular-nums">
                          {t("submittedDateShort")}: {submittedDate}
                        </span>
                      )}
                    </span>
                  </button>

                  {isExpanded && (
                  <div className="border-t border-slate-100 px-3 py-3 space-y-2">
                    {apt.meters.map((meter, idx) => {
                      const isHot = meter.meterType.toLowerCase().includes("hot");
                      const isElectricity = isElectricityMeter(meter);
                      const dotColor = isElectricity ? "bg-amber-400" : isHot ? "bg-red-500" : "bg-blue-500";
                      const consumptionColor = isElectricity ? "text-amber-600" : isHot ? "text-red-600" : "text-blue-600";
                      const unit = isElectricity ? "kWh" : "m3";
                      const currPeriod = readingMonthKey(meter.latestReading);
                      const currLabel = readingMonthLabel(meter.latestReading) ?? "";
                      const previousReading = currPeriod ? previousReadingForMonth(meter, currPeriod) : null;
                      const prevLabel = readingMonthLabel(previousReading) ?? "";
                      return (
                        <div key={idx} className="rounded-md border border-slate-100 bg-slate-50/50 px-2.5 py-2">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} />
                              <span className="font-medium text-slate-700 truncate">{meter.meterType}</span>
                            </div>
                            <span className="font-mono text-[11px] text-slate-500 tabular-nums truncate">{meter.serialNumber ? `#${meter.serialNumber}` : "—"}</span>
                          </div>
                          <div className="mt-2 grid grid-cols-3 items-end gap-1 text-sm tabular-nums">
                            <div>
                              <div className="text-[10px] uppercase tracking-wide text-slate-400">{prevLabel || t("prevShort")}</div>
                              <div className="text-slate-500">{previousReadingValue(previousReading)}</div>
                            </div>
                            <div>
                              <div className="text-[10px] uppercase tracking-wide text-slate-400">{currLabel || t("currShort")}</div>
                              <div className="font-semibold text-slate-900">{meter.latestReading?.currentValue ?? "—"}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-[10px] uppercase tracking-wide text-slate-400">{t("useShort")}</div>
                              <div className={`font-semibold ${consumptionColor}`}>+{readingConsumption(meter.latestReading)} {unit}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => openViewModal(apt)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                        {t("view")}
                      </button>
                      {canManageReadings ? (
                      <button
                        type="button"
                        onClick={() => openSubmitModal(apt)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z"/></svg>
                        {t("edit")}
                      </button>
                      ) : null}
                    </div>
                  </div>
                  )}

                  {isExpanded && (
                    <div className="border-t border-slate-100 bg-slate-50/60 px-3 py-3">
                      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">{t("history")}</h4>
                      <div className="space-y-2">
                        {(() => {
                          const byMonth = new Map<string, Array<{ meter: MeterInfo; r: MeterReadingRecord }>>();
                          apt.meters.forEach((meter) => {
                            meter.readings.forEach((r) => {
                              const key = readingMonthKey(r);
                              if (!key) return;
                              if (!byMonth.has(key)) byMonth.set(key, []);
                              byMonth.get(key)!.push({ meter, r });
                            });
                          });
                          const sortedMonths = Array.from(byMonth.keys()).sort((a, b) => b.localeCompare(a));
                          return sortedMonths.map((monthKey) => {
                            const [year, month] = monthKey.split("-");
                            const items = (byMonth.get(monthKey) || []).sort((a, b) => b.r.submittedAt.localeCompare(a.r.submittedAt));
                            const isMonthExpanded = expandedApartments.has(`month-${apt.id}-${monthKey}`);
                            return (
                              <div key={monthKey} className="rounded-md border border-slate-200 bg-white overflow-hidden">
                                <button
                                  onClick={() => toggleMonth(`${apt.id}-${monthKey}`)}
                                  className="flex w-full items-center justify-between gap-2 px-3 py-2 hover:bg-slate-50"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="font-mono text-xs font-semibold text-slate-700 tabular-nums">{year}-{month}</span>
                                    <span className="text-[11px] text-slate-400">{items.length === 1 ? t("readingsCount", { count: 1 }) : t("readingsCountPlural", { count: items.length })}</span>
                                  </div>
                                  <svg className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isMonthExpanded ? "rotate-90" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                                </button>
                                {isMonthExpanded && (
                                  <div className="border-t border-slate-100 px-2 py-2 space-y-1.5">
                                    {items.map(({ meter, r }) => {
                                      const isHot = meter.meterType.toLowerCase().includes("hot");
                                      const isElectricity = isElectricityMeter(meter);
                                      const dotColor = isElectricity ? "bg-amber-400" : isHot ? "bg-red-500" : "bg-blue-500";
                                      const consumptionColor = isElectricity ? "text-amber-600" : isHot ? "text-red-600" : "text-blue-600";
                                      const unit = isElectricity ? "kWh" : "m3";
                                      return (
                                        <div key={r.id} className="flex items-center justify-between gap-2 rounded-md bg-slate-50/50 px-2.5 py-2 text-xs">
                                          <div className="flex items-center gap-1.5 min-w-0">
                                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} />
                                            <span className="font-medium text-slate-700 truncate">{meter.meterType}</span>
                                          </div>
                                          <div className="text-right tabular-nums">
                                            <div className="text-slate-500">{r.previousValue} → <span className="font-semibold text-slate-900">{r.currentValue}</span></div>
                                            <div className={`font-semibold ${consumptionColor}`}>+{readingConsumption(r)} {unit}</div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-hidden rounded-md border border-slate-200">
            <div className="overflow-x-auto">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col className="w-10" />
                <col />
                <col className="w-36" />
                <col className="w-32" />
              </colgroup>
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 w-10"></th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t("colApartment")}</th>
                  <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t("colStatus")}</th>
                  <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t("colActions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredApartments.map((apt: ApartmentMeterData) => {
                  const isExpanded = expandedApartments.has(apt.id);
                  
                  return (
                    <React.Fragment key={apt.id}>
                      {/* Main Row */}
                      <tr className="border-t border-slate-100 hover:bg-slate-50/60 cursor-pointer transition-colors" onClick={() => toggleExpanded(apt.id)}>
                        <td className="px-3 py-3 text-center align-top">
                          <button className="text-slate-400 hover:text-slate-700 transition-transform inline-flex" aria-label={isExpanded ? t("history") : t("colApartment")}>
                            <svg className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-90" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                          </button>
                        </td>
                        <td className="px-3 py-3 align-top">
                          <div className="font-semibold text-slate-900 tabular-nums">{apt.apartment}</div>
                        </td>
                        <td className="px-2 py-2 text-center align-middle">
                          {(() => {
                            const dates = apt.meters
                              .map((m) => m.latestReading?.submittedAt)
                              .filter((d): d is string => Boolean(d) && d !== "—");
                            const latestDate = dates.length > 0 ? dates.sort().reverse()[0] : undefined;
                            const monthKeys = apt.meters
                              .map((m) => readingMonthKey(m.latestReading))
                              .filter(Boolean);
                            const statusMonthKey = monthKeys.length > 0 ? monthKeys.sort().reverse()[0] : undefined;
                            const cfg = STATUS_CFG[getPeriodStatus(latestDate, statusMonthKey)];
                            const submittedDate = submittedDateLabel(latestDate);
                            return (
                              <div className="inline-flex min-w-0 flex-col items-center gap-1">
                                <span className={`inline-flex max-w-full items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${cfg.bg} ${cfg.border} ${cfg.text}`}>
                                  <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                                  {cfg.label}
                                </span>
                                {submittedDate && (
                                  <span className="max-w-[8.5rem] truncate text-[11px] font-medium text-slate-500 tabular-nums">
                                    {t("submittedDateShort")}: {submittedDate}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                  
                        <td className="px-2 py-2 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-center gap-1">
                            <button
                              onClick={() => openViewModal(apt)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                              title="Данные счётчиков"
                            >
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                            </button>
                            {canManageReadings ? (
                            <button
                              onClick={() => openSubmitModal(apt)}
                              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              title="Сдать показание"
                            >
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z"/></svg>
                              {t("submit")}
                            </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>

                      {/* Expanded History */}
                      {isExpanded && (
                        <tr className="bg-slate-50/60">
                          <td colSpan={4} className="p-0">
                            <div className="px-4 py-4">
                              <div className="mb-4 grid gap-2 lg:grid-cols-2">
                                {apt.meters.map((meter, idx) => {
                                  const currPeriod = readingMonthKey(meter.latestReading);
                                  const currLabel = readingMonthLabel(meter.latestReading) ?? "";
                                  const previousReading = currPeriod ? previousReadingForMonth(meter, currPeriod) : null;
                                  const prevLabel = readingMonthLabel(previousReading) ?? "";
                                  const isHot = meter.meterType.toLowerCase().includes("hot");
                                  const isElectricity = isElectricityMeter(meter);
                                  const dotColor = isElectricity ? "bg-amber-400" : isHot ? "bg-red-500" : "bg-blue-500";
                                  const consumptionColor = isElectricity ? "text-amber-600" : isHot ? "text-red-600" : "text-blue-600";
                                  const unit = isElectricity ? "kWh" : "m3";
                                  return (
                                    <div key={idx} className="rounded-md border border-slate-200 bg-white px-3 py-2.5">
                                      <div className="mb-2 flex items-center justify-between gap-3">
                                        <span className="inline-flex min-w-0 items-center gap-2 text-xs font-medium text-slate-700">
                                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} />
                                          <span className="truncate">{meter.meterType}</span>
                                        </span>
                                        <span className="truncate font-mono text-[11px] text-slate-500 tabular-nums">
                                          {meter.serialNumber ? `#${meter.serialNumber}` : "—"}
                                        </span>
                                      </div>
                                      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_auto] items-end gap-2 text-sm tabular-nums">
                                        <div className="min-w-0 text-right leading-tight">
                                          <div className="truncate text-[10px] uppercase tracking-wide text-slate-400">{prevLabel || t("prevShort")}</div>
                                          <div className="truncate text-slate-500">{previousReadingValue(previousReading)}</div>
                                        </div>
                                        <svg className="h-3 w-3 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                                        <div className="min-w-0 text-right leading-tight">
                                          <div className="truncate text-[10px] uppercase tracking-wide text-slate-400">{currLabel || t("currShort")}</div>
                                          <div className="truncate font-semibold text-slate-900">{meter.latestReading?.currentValue ?? "—"}</div>
                                        </div>
                                        <span className="text-slate-300">=</span>
                                        <span className={`whitespace-nowrap font-semibold ${consumptionColor}`}>+{readingConsumption(meter.latestReading)} {unit}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-3">{t("readingHistory")}</h4>
                              <div className="space-y-2">
                                {(() => {
                                  // Группируем все показания по месяцам (YYYY-MM)
                                  const readingsByMonth = new Map<string, Array<{meter: MeterInfo, reading: MeterReadingRecord}>>();
                                  
                                  apt.meters.forEach(meter => {
                                    meter.readings.forEach(reading => {
                                      // Извлекаем YYYY-MM из submittedAt (формат: 2026-04-26T09:20:00)
                                      const monthKey = readingMonthKey(reading); // "2026-04"
                                      if (!monthKey) return;
                                      if (!readingsByMonth.has(monthKey)) {
                                        readingsByMonth.set(monthKey, []);
                                      }
                                      readingsByMonth.get(monthKey)!.push({meter, reading});
                                    });
                                  });
                                  
                                  // Сортируем месяцы по убыванию (новые первыми)
                                  const sortedMonths = Array.from(readingsByMonth.keys())
                                    .sort((a, b) => b.localeCompare(a))
                                    .filter(monthKey => {
                                      const monthReadings = readingsByMonth.get(monthKey) || [];
                                      return monthReadings.length > 0;
                                    });
                                  
                                  return sortedMonths.map(monthKey => {
                                    const [year, month] = monthKey.split('-');
                                    const monthLabel = `${year}-${month}`;
                                    const monthToggleKey = `${apt.id}-${monthKey}`;
                                    const isMonthExpanded = expandedApartments.has(`month-${monthToggleKey}`);
                                    const monthReadings = readingsByMonth.get(monthKey) || [];
                                    
                                    return (
                                      <div key={monthKey} className="border border-slate-200 rounded-md overflow-hidden bg-white">
                                        {/* Month Header */}
                                        <div className="flex items-center bg-white hover:bg-slate-50 transition-colors">
                                          <button
                                            type="button"
                                            onClick={() => toggleMonth(monthToggleKey)}
                                            className="flex flex-1 items-center justify-between px-4 py-2.5"
                                          >
                                            <div className="flex items-center gap-3">
                                              <span className="font-mono text-sm font-semibold text-slate-700 tabular-nums">{year}-{month}</span>
                                              <span className="text-xs text-slate-500">{monthLabel}</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                              <span className="text-[11px] uppercase tracking-wide text-slate-400">{monthReadings.length === 1 ? t("readingsCount", { count: 1 }) : t("readingsCountPlural", { count: monthReadings.length })}</span>
                                              <svg className={`h-4 w-4 text-slate-400 transition-transform ${isMonthExpanded ? "rotate-90" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                                            </div>
                                          </button>
                                          {canManageReadings ? (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              deleteMonthReadings(
                                                apt.apartmentId,
                                                monthKey,
                                                monthReadings.map((r) => r.reading.id),
                                              );
                                            }}
                                            disabled={deletingMonthKey === `${apt.apartmentId}:${monthKey}`}
                                            className="mr-3 inline-flex h-7 w-7 items-center justify-center rounded-md border border-rose-200 bg-white text-rose-500 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                                            title={t("deleteReadingsTitle", { monthKey })}
                                          >
                                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                              <path d="M3 6h18" />
                                              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                              <path d="M10 11v6M14 11v6" />
                                            </svg>
                                          </button>
                                          ) : null}
                                        </div>
                                        
                                        {/* Month Content */}
                                        {isMonthExpanded && (
                                          <div className="p-4 bg-white">
                                            <table className="w-full text-sm">
                                              <thead className="border-b border-slate-200">
                                                <tr className="text-slate-600 text-xs font-semibold uppercase">
                                                  <th className="text-left py-2 px-2">{t("colMeter")}</th>
                                                  <th className="text-left py-2 px-2">{t("colDate")}</th>
                                                  <th className="text-right py-2 px-2">{t("colPrevious")}</th>
                                                  <th className="text-right py-2 px-2">{t("colCurrent")}</th>
                                                  <th className="text-right py-2 px-2">{t("colConsumption")}</th>
                                                  <th className="text-center py-2 px-2">{t("colStatus")}</th>
                                                </tr>
                                              </thead>
                                              <tbody className="divide-y divide-slate-100">
                                                {monthReadings.map(item => {
                                                  // Форматируем дату: DD.MM.YYYY, HH:MM
                                                  const dateObj = new Date(item.reading.submittedAt);
                                                  const formattedDate = dateObj.toLocaleDateString('en-GB') + ', ' + dateObj.toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'});
                                                  const dateParts = formattedDate.split(',');
                                                  const dateFormatted = dateParts[0] + ',' + dateParts[1];
                                                  
                                                  const isHot = item.meter.meterType.toLowerCase().includes("hot");
                                                  const dotColor = isHot ? "bg-red-500" : "bg-blue-500";
                                                  return (
                                                    <tr key={item.reading.id} className="hover:bg-slate-50">
                                                      <td className="py-2.5 px-2">
                                                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700">
                                                          <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
                                                          {item.meter.meterType}
                                                        </span>
                                                      </td>
                                                      <td className="py-2.5 px-2 text-slate-600 tabular-nums">{dateFormatted}</td>
                                                      <td className="py-2.5 px-2 text-right text-slate-500 tabular-nums">{item.reading.previousValue}</td>
                                                      <td className="py-2.5 px-2 text-right font-semibold text-slate-900 tabular-nums">{item.reading.currentValue}</td>
                                                      <td className="py-2.5 px-2 text-right tabular-nums font-semibold text-slate-700">+{readingConsumption(item.reading)}</td>
                                                      <td className="py-2.5 px-2 text-center">
                                                        {(() => {
                                                          const cfg = item.reading.status === "verified"
                                                            ? { dot: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", label: t("statusVerified") }
                                                            : item.reading.status === "pending"
                                                            ? { dot: "bg-amber-500", text: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", label: t("statusPending") }
                                                            : { dot: "bg-slate-500", text: "text-slate-700", bg: "bg-slate-50", border: "border-slate-200", label: t("statusSubmitted") };
                                                          return (
                                                            <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium ${cfg.bg} ${cfg.border} ${cfg.text}`}>
                                                              <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                                                              {cfg.label}
                                                            </span>
                                                          );
                                                        })()}
                                                      </td>
                                                    </tr>
                                                  );
                                                })}
                                              </tbody>
                                            </table>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  });
                                })()}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
          </>
        ) : (
          <div className="rounded-md border border-dashed border-slate-300 bg-white py-12 text-center text-sm text-slate-500">
            {t("noReadings")}
          </div>
        )}
      </section>
    </div>
  );
}
