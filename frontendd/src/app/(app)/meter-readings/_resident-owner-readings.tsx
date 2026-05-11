"use client";

import { useEffect, useState, type FormEvent } from "react";
import { SectionCard } from "@/components/section-card";
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
  previousValue: number;
  currentValue: number;
  consumption: number;
  submittedAt: string;
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
};

const METER_LABELS: Record<ResidentOwnerMeterOption["key"], string> = {
  coldmeterwater: "Холодная вода",
  hotmeterwater: "Горячая вода",
};

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

function submissionClosedMessage(value?: SubmissionPeriodValue | null) {
  const period = resolveCurrentSubmissionPeriod(value);
  if (!period) return "Период сдачи показаний сейчас закрыт.";

  return `Период сдачи показаний закрыт. Доступно с ${formatPeriodDate(period.startDate)} по ${formatPeriodDate(period.endDate)}.`;
}

function monthLabelFromDate(value: string) {
  const [year = "", month = ""] = value.split("-");
  return month && year ? `${month}.${year}` : value;
}

function meterFromGroup(key: ResidentOwnerMeterOption["key"], group: unknown): ResidentOwnerMeterOption | null {
  if (!group || typeof group !== "object") return null;
  const data = group as UnknownRecord;
  const meterId = text(data.meterId, data.id, data.serialNumber);
  if (!meterId) return null;

  return {
    key,
    id: meterId,
    label: METER_LABELS[key],
    serialNumber: text(data.serialNumber, data.meterId, "-"),
    previousValue: numberValue(data.currentValue, numberValue(data.previousValue)),
  };
}

function normalizeApartment(item: UnknownRecord): ResidentOwnerApartmentOption | null {
  const id = text(item.id, item.apartmentId);
  if (!id || id === "-") return null;

  const waterReadings = item.waterReadings && typeof item.waterReadings === "object"
    ? item.waterReadings as UnknownRecord
    : {};
  const meters = [
    meterFromGroup("coldmeterwater", waterReadings.coldmeterwater),
    meterFromGroup("hotmeterwater", waterReadings.hotmeterwater),
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
  const submissionPeriod = readingConfig.submissionPeriod && typeof readingConfig.submissionPeriod === "object"
    ? readingConfig.submissionPeriod as Partial<SubmissionPeriodValue>
    : null;

  return {
    id,
    submissionPeriod: submissionPeriod?.startDate && submissionPeriod?.endDate
      ? {
          startDate: String(submissionPeriod.startDate),
          endDate: String(submissionPeriod.endDate),
          monthly: Boolean(submissionPeriod.monthly),
        }
      : null,
  };
}

function normalizeReading(item: UnknownRecord): ReadingRow {
  const meterKey = text(item.meterKey);
  const previousValue = numberValue(item.previousValue);
  const currentValue = numberValue(item.currentValue, numberValue(item.value));

  return {
    id: text(item.id, item.meterId, `${text(item.apartmentId)}-${meterKey}-${text(item.submittedAt)}`),
    apartmentId: text(item.apartmentId),
    apartment: text(item.apartmentNumber, item.apartment, item.apartmentId, "-"),
    meterKey,
    meterLabel: meterKey === "hotmeterwater" ? METER_LABELS.hotmeterwater : METER_LABELS.coldmeterwater,
    previousValue,
    currentValue,
    consumption: numberValue(item.consumption, Math.max(0, currentValue - previousValue)),
    submittedAt: formatDate(item.submittedAt),
  };
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
    const key = reading.submittedAt.slice(0, 7);
    const group = groupedReadings.get(key);

    if (group) {
      group.push(reading);
    } else {
      groupedReadings.set(key, [reading]);
    }
  }

  return Array.from(groupedReadings.entries()).map(([key, items]) => ({
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
) {
  return readings
    .filter(
      (reading) =>
        reading.meterKey === meter.key &&
        readingMonthKey(reading) < period &&
        readingBelongsToApartment(reading, apartment),
    )
    .sort((a, b) => readingMonthKey(b).localeCompare(readingMonthKey(a)))[0] ?? null;
}

function previousValueForMeter(
  apartment: ResidentOwnerApartmentOption,
  meter: ResidentOwnerMeterOption,
  readings: ReadingRow[],
  period: string,
) {
  const previousReading = previousReadingForMeter(apartment, meter, readings, period);
  return previousReading ? previousReading.currentValue : 0;
}

function apartmentWithPeriodPreviousValues(
  apartment: ResidentOwnerApartmentOption,
  readings: ReadingRow[],
  period: string,
) {
  return {
    ...apartment,
    meters: apartment.meters.map((meter) => {
      const previousReading = previousReadingForMeter(apartment, meter, readings, period);

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
      .filter((reading) => reading.submittedAt.slice(0, 7) === period && readingBelongsToApartment(reading, apartment))
      .map((reading) => reading.meterKey),
  );

  return apartment.meters.every((meter) => submittedMeterKeys.has(meter.key));
}

function sortReadingsByDate(readings: ReadingRow[]) {
  return readings.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
}

export function ResidentOwnerMeterReadings() {
  const notify = useNotifications();
  const [apartments, setApartments] = useState<ResidentOwnerApartmentOption[]>([]);
  const [readings, setReadings] = useState<ReadingRow[]>([]);
  const [selectedApartmentId, setSelectedApartmentId] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const period = currentMonth();
  const monthGroups = groupReadingsByMonth(readings);
  const visibleApartments = selectedApartmentId
    ? apartments.filter((apartment) => apartment.id === selectedApartmentId)
    : apartments.slice(0, 1);
  const selectedSubmissionPeriod = visibleApartments[0]?.submissionPeriod ?? null;
  const submissionOpen = isSubmissionPeriodOpen(selectedSubmissionPeriod);
  const currentMonthSubmitted = hasSubmittedCurrentMonth(visibleApartments[0], readings, period);
  const missingCurrentMonthApartments = apartments.filter((apartment) => !hasSubmittedCurrentMonth(apartment, readings, period));
  const submitApartments = visibleApartments.map((apartment) =>
    apartmentWithPeriodPreviousValues(apartment, readings, period),
  );

  const loadData = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setError(null);
      const apartmentsResponse = await apiFetch<{ apartments?: UnknownRecord[]; buildings?: UnknownRecord[] }>("/resident/apartments");
      const buildingPeriods = new Map(
        (apartmentsResponse.buildings ?? [])
          .map(normalizeBuilding)
          .filter((item): item is BuildingOption => Boolean(item))
          .map((building) => [building.id, building.submissionPeriod] as const),
      );
      const normalizedApartments = (apartmentsResponse.apartments ?? [])
        .map(normalizeApartment)
        .filter((item): item is ResidentOwnerApartmentOption => Boolean(item))
        .map((apartment) => ({
          ...apartment,
          submissionPeriod: buildingPeriods.get(apartment.buildingId) ?? apartment.submissionPeriod ?? null,
        }));

      const readingBatches = await Promise.all(
        normalizedApartments.map((apartment) =>
          apiFetch<{ items?: UnknownRecord[] }>(`/meter-readings?apartmentId=${encodeURIComponent(apartment.id)}`)
            .catch(() => ({ items: [] })),
        ),
      );

      const normalizedReadings = readingBatches
        .flatMap((response) => response.items ?? [])
        .map(normalizeReading);

      setApartments(normalizedApartments);
      setReadings(sortReadingsByDate(normalizedReadings));
      setSelectedApartmentId((current) =>
        normalizedApartments.some((apartment) => apartment.id === current)
          ? current
          : normalizedApartments[0]?.id ?? "",
      );
      setValues({});
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Не удалось загрузить показания");
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
      notify.info("Введите хотя бы одно показание");
      return;
    }

    if (!submissionOpen) {
      notify.info("Период сдачи показаний сейчас закрыт");
      return;
    }

    if (currentMonthSubmitted) {
      notify.info("Показания за этот месяц уже сданы");
      return;
    }

    for (const { apartment, meter } of filledMeters) {
      const currentValue = numberValue(values[residentOwnerMeterValueKey(apartment.id, meter.key)], NaN);
      const previousValue = previousValueForMeter(apartment, meter, readings, period);
      if (!Number.isFinite(currentValue)) {
        notify.error("Показание должно быть числом");
        return;
      }
      if (currentValue < previousValue) {
        notify.error(`${meter.label}: показание не может быть меньше предыдущего`);
        return;
      }
    }

    try {
      setSubmitting(true);
      const submittedAt = toIsoDate(new Date());
      const optimisticReadings: ReadingRow[] = [];
      let optimisticIndex = 0;

      for (const { apartment, meter } of filledMeters) {
        const currentValue = numberValue(values[residentOwnerMeterValueKey(apartment.id, meter.key)]);
        const previousValue = previousValueForMeter(apartment, meter, readings, period);
        await apiFetch("/meter-readings", {
          method: "POST",
          body: JSON.stringify({
            apartmentId: apartment.id,
            meterId: meter.id,
            meterKey: meter.key,
            previousValue,
            currentValue,
            consumption: Math.max(0, currentValue - previousValue),
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
          previousValue,
          currentValue,
          consumption: Math.max(0, currentValue - previousValue),
          submittedAt,
        });
        optimisticIndex += 1;
      }

      setReadings((current) => {
        const submittedKeys = new Set(
          optimisticReadings.map((reading) => `${reading.apartmentId}:${reading.meterKey}:${reading.submittedAt.slice(0, 7)}`),
        );
        const keptReadings = current.filter(
          (reading) => !submittedKeys.has(`${reading.apartmentId}:${reading.meterKey}:${reading.submittedAt.slice(0, 7)}`),
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
      notify.success("Показания отправлены");
      notifyMeterReadingsChanged();
    } catch (caughtError) {
      notify.error(caughtError instanceof Error ? caughtError.message : "Не удалось отправить показания");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionCard title="Сдача показаний" description="Передайте текущие показания по вашим счётчикам">
        {loading ? (
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-6 text-center text-slate-500">Загрузка...</div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        ) : apartments.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-slate-600">К вам пока не привязаны квартиры.</div>
        ) : (
          <ResidentOwnerSubmitForm
            apartments={submitApartments}
            apartmentOptions={apartments}
            selectedApartmentId={selectedApartmentId}
            submissionOpen={submissionOpen}
            currentMonthSubmitted={currentMonthSubmitted}
            closedMessage={submissionClosedMessage(selectedSubmissionPeriod)}
            values={values}
            period={period}
            submitting={submitting}
            onApartmentChange={(apartmentId) => setSelectedApartmentId(apartmentId)}
            onSubmit={submitReadings}
            onValueChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))}
          />
        )}

        {!loading && !error ? (
          <div className="mt-8 space-y-4">
            <h3 className="text-2xl font-bold text-slate-950">История показаний</h3>
            {monthGroups.length > 0 ? (
              <div className="space-y-3">
                {monthGroups.map((monthGroup) => (
                  <details
                    key={monthGroup.key}
                    className="group overflow-hidden rounded-2xl border border-slate-200 bg-white"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 bg-slate-50 px-4 py-3 transition hover:bg-slate-100">
                      <div>
                        <p className="font-semibold text-slate-900">{monthGroup.label}</p>
                        <p className="text-sm text-slate-500">{monthGroup.count} показаний</p>
                      </div>
                      <span className="text-xl leading-none text-slate-400 transition group-open:rotate-180">⌄</span>
                    </summary>

                    <div className="space-y-3 p-3">
                      {monthGroup.periods.map((group) => (
                        <div key={group.key} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50/70 px-4 py-2.5">
                            <div>
                              <p className="text-xs text-slate-500">Дата</p>
                              <p className="text-sm font-semibold text-slate-900">{group.date}</p>
                            </div>
                            <div className="text-left sm:text-right">
                              <p className="text-xs text-slate-500">Квартира</p>
                              <p className="text-sm font-semibold text-slate-900">{group.apartment}</p>
                            </div>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[560px] text-sm">
                              <thead className="text-left text-slate-500">
                                <tr>
                                  <th className="px-4 py-2 font-semibold">Счётчик</th>
                                  <th className="px-4 py-2 text-right font-semibold">Пред.</th>
                                  <th className="px-4 py-2 text-right font-semibold">Текущ.</th>
                                  <th className="px-4 py-2 text-right font-semibold">Расход</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {group.items.map((reading) => (
                                  <tr key={reading.id}>
                                    <td className="px-4 py-3 text-slate-700">{reading.meterLabel}</td>
                                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">{reading.previousValue}</td>
                                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-900">{reading.currentValue}</td>
                                    <td className="px-4 py-3 text-right tabular-nums text-blue-700">{reading.consumption} m3</td>
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
                Истории показаний пока нет.
              </div>
            )}
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}
