"use client";

import type { FormEvent } from "react";
import { useTranslations } from "next-intl";
import MeterReadingInput from "@/components/ui/meter-reading-input";

export interface ResidentOwnerMeterOption {
  key: "coldmeterwater" | "hotmeterwater" | "electricitymeter";
  id: string;
  label: string;
  serialNumber: string;
  previousValue: number | string;
  previousPeriod?: string;
  meterDigits?: number;
  userCanSetDigits?: boolean;
}

export interface ResidentOwnerApartmentOption {
  id: string;
  label: string;
  buildingId: string;
  submissionPeriod?: SubmissionPeriodValue | null;
  waterSubmissionPeriod?: SubmissionPeriodValue | null;
  electricitySubmissionPeriod?: SubmissionPeriodValue | null;
  electricityAllowMultipleMonthlySubmissions?: boolean;
  electricityFixedPriceEnabled?: boolean;
  electricityPricePerKwh?: number;
  meters: ResidentOwnerMeterOption[];
}

export interface SubmissionPeriodValue {
  startDate: string;
  endDate: string;
  monthly: boolean;
}

interface ResidentOwnerSubmitFormProps {
  apartments: ResidentOwnerApartmentOption[];
  apartmentOptions?: ResidentOwnerApartmentOption[];
  selectedApartmentId?: string;
  submissionOpen?: boolean;
  currentMonthSubmitted?: boolean;
  closedMessage?: string;
  values: Record<string, string>;
  meterDigits?: Record<string, number>;
  period: string;
  submitting: boolean;
  onApartmentChange?: (apartmentId: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onValueChange: (key: string, value: string) => void;
  onMeterDigitsChange?: (key: string, value: number) => void;
}

export function residentOwnerMeterValueKey(apartmentId: string, meterKey: ResidentOwnerMeterOption["key"]) {
  return `${apartmentId}:${meterKey}`;
}

function periodLabels(value: string) {
  const [yearRaw, monthRaw] = value.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);

  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return { current: "", previous: "" };
  }

  const previousDate = new Date(year, month - 2, 1);
  return {
    current: `${String(month).padStart(2, "0")}.${year}`,
    previous: `${String(previousDate.getMonth() + 1).padStart(2, "0")}.${previousDate.getFullYear()}`,
  };
}

export function ResidentOwnerSubmitForm({
  apartments,
  apartmentOptions = apartments,
  selectedApartmentId,
  submissionOpen = true,
  currentMonthSubmitted = false,
  closedMessage,
  values,
  meterDigits = {},
  period,
  submitting,
  onApartmentChange,
  onSubmit,
  onValueChange,
  onMeterDigitsChange,
}: ResidentOwnerSubmitFormProps) {
  const t = useTranslations("meterReadings.resident");
  const hasMeters = apartments.some((apartment) => apartment.meters.length > 0);
  const periodDisplay = periodLabels(period);
  const showApartmentSelector = apartmentOptions.length > 1 && onApartmentChange;

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      {showApartmentSelector ? (
        <label className="block max-w-sm">
          <span className="mb-1 block text-sm font-semibold text-slate-700">{t("apartment")}</span>
          <select
            value={selectedApartmentId ?? ""}
            onChange={(event) => onApartmentChange(event.target.value)}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          >
            {apartmentOptions.map((apartment) => (
              <option key={apartment.id} value={apartment.id}>
                {t("apartmentOption", { apartment: apartment.label })}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {currentMonthSubmitted ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {t("alreadySubmittedWithPeriod")}
        </div>
      ) : !submissionOpen ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {closedMessage ?? t("closedDefault")}
        </div>
      ) : hasMeters ? (
        <div className="w-full rounded-2xl border border-slate-200 bg-slate-50/70 p-4 shadow-sm">
          <div className="space-y-5">
            {apartments.map((apartment) => (
              <div key={apartment.id} className="space-y-3">
                {apartments.length > 1 ? (
                  <p className="text-base font-semibold text-slate-900">{t("apartmentNumber", { apartment: apartment.label })}</p>
                ) : null}

                <div className="grid min-w-0 items-start gap-5 lg:grid-cols-2">
                  {apartment.meters.map((meter) => {
                    const key = residentOwnerMeterValueKey(apartment.id, meter.key);
                    const isElectricity = meter.key === "electricitymeter";
                    const activeMeterDigits = Math.min(7, Math.max(5, meterDigits[key] ?? meter.meterDigits ?? 6));

                    return (
                      <div key={key} className={isElectricity ? "rounded-2xl border border-amber-200 bg-amber-50/60 p-3" : undefined}>
                        {isElectricity && meter.userCanSetDigits ? (
                          <label className="mb-3 block text-sm font-semibold text-amber-800">
                            {t("electricityDigits")}
                            <select
                              value={String(activeMeterDigits)}
                              onChange={(event) => onMeterDigitsChange?.(key, Number(event.target.value))}
                              className="mt-1 h-9 w-full rounded-lg border border-amber-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                            >
                              <option value="5">5</option>
                              <option value="6">6</option>
                              <option value="7">7</option>
                            </select>
                          </label>
                        ) : null}
                        <MeterReadingInput
                          variant={isElectricity ? "electricity" : meter.key === "hotmeterwater" ? "hot" : "cold"}
                          label={meter.label}
                          serialNumber={meter.serialNumber}
                          previousValue={meter.previousValue}
                          previousPeriod={meter.previousPeriod ?? periodDisplay.previous}
                          currentPeriod={periodDisplay.current}
                          value={values[key] ?? ""}
                          onChange={(nextValue) => onValueChange(key, nextValue)}
                          intDigits={isElectricity ? activeMeterDigits : 5}
                          decDigits={isElectricity ? 0 : 3}
                          size="compact"
                          labels={{
                            previous: t("previousReading"),
                            current: t("currentReading"),
                            serialPrefix: t("serialPrefix"),
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 border-t border-slate-200 pt-4">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-slate-900 px-3.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {submitting ? t("submitting") : t("submit")}
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {t("noMeters")}
        </div>
      )}
    </form>
  );
}
