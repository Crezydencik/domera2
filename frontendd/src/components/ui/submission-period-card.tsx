"use client";

import React from "react";
import { Button } from "@/components/ui/button";

export interface SubmissionPeriodValue {
  startDate: string;
  endDate: string;
  monthly: boolean;
  reminders?: SubmissionReminderValue;
}

export interface SubmissionReminderValue {
  enabled: boolean;
  onStart: boolean;
  onEnd: boolean;
  onClose: boolean;
  startTime: string;
  endTime: string;
  closeTime: string;
  startOffsetDays: number;
  endOffsetDays: number;
  closeOffsetDays: number;
}

interface SubmissionPeriodLabels {
  startDate?: string;
  endDate?: string;
  monthly?: string;
  freeMode?: string;
  dateMode?: string;
  freeModeHint?: string;
  monthlyHint?: (startDay: number, endDay: number) => string;
  save?: string;
  saving?: string;
  delete?: string;
  deleting?: string;
  remindersTitle?: string;
  remindersEnabled?: string;
  reminderOnStart?: string;
  reminderOnEnd?: string;
  reminderOnClose?: string;
  reminderStartTime?: string;
  reminderEndTime?: string;
  reminderCloseTime?: string;
  reminderOffsetDays?: string;
  reminderEndOffsetPrefix?: string;
  reminderEndOffsetSuffix?: string;
  reminderItemColumn?: string;
  reminderTimeColumn?: string;
}

interface SubmissionPeriodCardProps {
  buildingLabel?: string;
  value: SubmissionPeriodValue | null;
  onSave: (value: SubmissionPeriodValue | null) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  saving?: boolean;
  deleting?: boolean;
  bare?: boolean;
  hideHeader?: boolean;
  locale?: string;
  labels?: SubmissionPeriodLabels;
  beforeActions?: React.ReactNode;
}

const formatDate = (iso: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("lv-LV");
};

const toIsoDate = (date: Date) => (
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
);

const currentMonthDateFromStoredDay = (value: string) => {
  const stored = new Date(value);
  if (Number.isNaN(stored.getTime())) return value;
  const today = new Date();
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const day = Math.min(Math.max(stored.getDate(), 1), lastDay);
  return toIsoDate(new Date(today.getFullYear(), today.getMonth(), day));
};

const displayPeriodDate = (value: string | undefined, monthly: boolean) => {
  if (!value) return "";
  return monthly ? currentMonthDateFromStoredDay(value) : value;
};

const datePlaceholder = (locale?: string) => {
  const code = locale?.slice(0, 2).toLowerCase();
  if (code === "ru") return "дд.мм.гггг";
  if (code === "en") return "dd.mm.yyyy";
  return "dd.mm.gggg";
};

const formatDateForInput = (value: string) => {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}.${month}.${year}` : value;
};

const parseDisplayDate = (value: string) => {
  const trimmed = value.trim();
  const localMatch = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(trimmed);
  if (localMatch) {
    const [, day, month, year] = localMatch;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    if (
      date.getFullYear() === Number(year) &&
      date.getMonth() === Number(month) - 1 &&
      date.getDate() === Number(day)
    ) {
      return toIsoDate(date);
    }
  }

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  return isoMatch ? trimmed : "";
};

function DateField({
  value,
  onChange,
  locale,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  locale?: string;
  className: string;
}) {
  const pickerRef = React.useRef<HTMLInputElement | null>(null);
  const [displayValue, setDisplayValue] = React.useState(formatDateForInput(value));

  React.useEffect(() => {
    setDisplayValue(formatDateForInput(value));
  }, [value]);

  return (
    <div className="relative">
      <input
        type="text"
        inputMode="numeric"
        value={displayValue}
        placeholder={datePlaceholder(locale)}
        onChange={(event) => {
          const nextDisplay = event.target.value;
          setDisplayValue(nextDisplay);
          const parsed = parseDisplayDate(nextDisplay);
          if (parsed || nextDisplay.trim() === "") onChange(parsed);
        }}
        onBlur={() => setDisplayValue(formatDateForInput(value))}
        className={`${className} pr-11`}
      />
      <button
        type="button"
        aria-label="Open calendar"
        onClick={() => {
          const picker = pickerRef.current;
          if (!picker) return;
          if (typeof picker.showPicker === "function") {
            picker.showPicker();
          } else {
            picker.click();
          }
        }}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-700 hover:text-slate-950"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </button>
      <input
        ref={pickerRef}
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="pointer-events-none absolute inset-y-0 right-0 h-full w-11 opacity-0"
        tabIndex={-1}
      />
    </div>
  );
}

const defaultReminders: SubmissionReminderValue = {
  enabled: true,
  onStart: true,
  onEnd: true,
  onClose: true,
  startTime: "08:00",
  endTime: "18:00",
  closeTime: "18:00",
  startOffsetDays: 0,
  endOffsetDays: 1,
  closeOffsetDays: 0,
};

const normalizeOffsetDays = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(31, Math.max(0, Math.floor(parsed))) : fallback;
};

const normalizeReminders = (value?: SubmissionReminderValue): SubmissionReminderValue => ({
  enabled: value?.enabled ?? defaultReminders.enabled,
  onStart: value?.onStart ?? defaultReminders.onStart,
  onEnd: value?.onEnd ?? defaultReminders.onEnd,
  onClose: value?.onClose ?? defaultReminders.onClose,
  startTime: value?.startTime || defaultReminders.startTime,
  endTime: value?.endTime || defaultReminders.endTime,
  closeTime: value?.closeTime || defaultReminders.closeTime,
  startOffsetDays: defaultReminders.startOffsetDays,
  endOffsetDays: normalizeOffsetDays(value?.endOffsetDays, defaultReminders.endOffsetDays),
  closeOffsetDays: normalizeOffsetDays(value?.closeOffsetDays, defaultReminders.closeOffsetDays),
});

export function SubmissionPeriodCard({
  buildingLabel,
  value,
  onSave,
  onDelete,
  saving,
  deleting,
  bare,
  hideHeader,
  locale,
  labels,
  beforeActions,
}: SubmissionPeriodCardProps) {
  const [startDate, setStartDate] = React.useState(displayPeriodDate(value?.startDate, value?.monthly ?? false));
  const [endDate, setEndDate] = React.useState(displayPeriodDate(value?.endDate, value?.monthly ?? false));
  const [monthly, setMonthly] = React.useState(value?.monthly ?? false);
  const [reminders, setReminders] = React.useState<SubmissionReminderValue>(() => normalizeReminders(value?.reminders));
  const [freeMode, setFreeMode] = React.useState(!value?.startDate && !value?.endDate);

  React.useEffect(() => {
    const nextMonthly = value?.monthly ?? false;
    setStartDate(displayPeriodDate(value?.startDate, nextMonthly));
    setEndDate(displayPeriodDate(value?.endDate, nextMonthly));
    setMonthly(nextMonthly);
    setReminders(normalizeReminders(value?.reminders));
    setFreeMode(!value?.startDate && !value?.endDate);
  }, [value?.startDate, value?.endDate, value?.monthly, value?.reminders]);

  const summary = startDate && endDate ? `${formatDate(startDate)} - ${formatDate(endDate)}` : "-";
  const inputClass =
    "rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 transition-colors focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100";

  const inner = (
    <>
      {!hideHeader && (
        <div className="mb-5 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            {buildingLabel && <div className="truncate text-sm font-semibold text-slate-900">{buildingLabel}</div>}
            <div className="text-xs text-slate-500">{freeMode ? labels?.freeMode ?? "Free submission" : summary}</div>
          </div>
        </div>
      )}

      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setFreeMode(true)}
          className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${
            freeMode
              ? "border-blue-500 bg-blue-50 text-blue-700"
              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          {labels?.freeMode ?? "Free submission"}
        </button>
        <button
          type="button"
          onClick={() => setFreeMode(false)}
          className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${
            !freeMode
              ? "border-blue-500 bg-blue-50 text-blue-700"
              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          {labels?.dateMode ?? "By dates"}
        </button>
      </div>

      {freeMode ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {labels?.freeModeHint ?? "Residents can submit readings at any time."}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
              {labels?.startDate ?? "Start date"}
              <DateField
                value={startDate}
                onChange={setStartDate}
                locale={locale}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
              {labels?.endDate ?? "End date"}
              <DateField
                value={endDate}
                onChange={setEndDate}
                locale={locale}
                className={inputClass}
              />
            </label>
          </div>

          <label className="mt-4 inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={monthly}
              onChange={(e) => {
                const nextMonthly = e.target.checked;
                setMonthly(nextMonthly);
                if (nextMonthly) {
                  setStartDate((current) => currentMonthDateFromStoredDay(current));
                  setEndDate((current) => currentMonthDateFromStoredDay(current));
                }
              }}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            {labels?.monthly ?? "Submit every month"}
          </label>
          {monthly && startDate && endDate && (
            <p className="mt-1.5 text-xs text-slate-500">
              {labels?.monthlyHint
                ? labels.monthlyHint(new Date(startDate).getDate(), new Date(endDate).getDate())
                : `The period repeats monthly from day ${new Date(startDate).getDate()} to day ${new Date(endDate).getDate()}.`}
            </p>
          )}

          <div className="mt-5 border-t border-slate-100 pt-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm font-semibold text-slate-900">
                {labels?.remindersTitle ?? "Reminder sending"}
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={reminders.enabled}
                  onChange={(e) => setReminders((current) => ({ ...current, enabled: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                {labels?.remindersEnabled ?? "Send email reminders"}
              </label>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="hidden grid-cols-[minmax(0,1fr)_8.5rem] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase text-slate-500 sm:grid">
                <div>{labels?.reminderItemColumn ?? "Reminder"}</div>
                <div>{labels?.reminderTimeColumn ?? "Time"}</div>
              </div>
              {[
                {
                  key: "onStart" as const,
                  timeKey: "startTime" as const,
                  offsetKey: "startOffsetDays" as const,
                  label: labels?.reminderOnStart ?? "On the first submission day",
                  timeLabel: labels?.reminderStartTime ?? "First reminder time",
                  editableOffset: false,
                },
                {
                  key: "onEnd" as const,
                  timeKey: "endTime" as const,
                  offsetKey: "endOffsetDays" as const,
                  label: labels?.reminderOnEnd ?? "Before closing if readings are missing",
                  timeLabel: labels?.reminderEndTime ?? "Final reminder time",
                  editableOffset: true,
                },
                {
                  key: "onClose" as const,
                  timeKey: "closeTime" as const,
                  offsetKey: "closeOffsetDays" as const,
                  label: labels?.reminderOnClose ?? "On the last submission day",
                  timeLabel: labels?.reminderCloseTime ?? "Closing date reminder time",
                  editableOffset: false,
                },
              ].map((item, index) => (
                <div
                  key={item.key}
                  className={`grid grid-cols-1 items-center gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_8.5rem] ${
                    index > 0 ? "border-t border-slate-100" : ""
                  }`}
                >
                  <label className="flex min-w-0 cursor-pointer items-center gap-2 text-sm font-medium leading-5 text-slate-700">
                    <input
                      type="checkbox"
                      checked={reminders[item.key]}
                      disabled={!reminders.enabled}
                      onChange={(e) => setReminders((current) => ({ ...current, [item.key]: e.target.checked }))}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                    />
                    {item.editableOffset ? (
                      <span className="flex min-w-0 flex-wrap items-center gap-2">
                        {(labels?.reminderEndOffsetPrefix ?? "За") ? (
                          <span>{labels?.reminderEndOffsetPrefix ?? "За"}</span>
                        ) : null}
                        <input
                          type="number"
                          min={0}
                          max={31}
                          value={String(reminders[item.offsetKey] ?? 0)}
                          disabled={!reminders.enabled || !reminders[item.key]}
                          onChange={(e) => setReminders((current) => ({
                            ...current,
                            [item.offsetKey]: normalizeOffsetDays(e.target.value, current[item.offsetKey]),
                          }))}
                          className="h-9 w-16 rounded-lg border border-slate-200 bg-slate-50 px-2 text-sm text-slate-900 outline-none transition-colors focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                          aria-label={labels?.reminderOffsetDays ?? "Reminder day offset"}
                        />
                        <span>{labels?.reminderEndOffsetSuffix ?? "days before closing if readings are missing"}</span>
                      </span>
                    ) : (
                      <span className="min-w-0">{item.label}</span>
                    )}
                  </label>
                  <input
                    type="time"
                    value={reminders[item.timeKey]}
                    disabled={!reminders.enabled || !reminders[item.key]}
                    onChange={(e) => setReminders((current) => ({ ...current, [item.timeKey]: e.target.value }))}
                    className={`${inputClass} w-full disabled:cursor-not-allowed disabled:opacity-60`}
                    aria-label={item.timeLabel}
                  />
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {beforeActions}

      <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
        {onDelete && (value?.startDate || value?.endDate) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={deleting}
            onClick={() => onDelete()}
            className="text-rose-600! hover:bg-rose-50!"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            </svg>
            {deleting ? labels?.deleting ?? "Deleting..." : labels?.delete ?? "Delete period"}
          </Button>
        )}
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={saving || (!freeMode && (!startDate || !endDate))}
          onClick={() => onSave(freeMode ? null : { startDate, endDate, monthly, reminders })}
        >
          {saving ? labels?.saving ?? "Saving..." : labels?.save ?? "Save"}
        </Button>
      </div>
    </>
  );

  if (bare) return <div>{inner}</div>;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {inner}
    </section>
  );
}
