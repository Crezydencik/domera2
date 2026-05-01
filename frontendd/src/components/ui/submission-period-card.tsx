"use client";

import React from "react";
import { Button } from "@/components/ui/button";

export interface SubmissionPeriodValue {
  startDate: string;
  endDate: string;
  monthly: boolean;
}

interface SubmissionPeriodCardProps {
  buildingLabel?: string;
  value: SubmissionPeriodValue | null;
  onSave: (value: SubmissionPeriodValue) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  saving?: boolean;
  deleting?: boolean;
  bare?: boolean;
  hideHeader?: boolean;
}

const formatDate = (iso: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("lv-LV");
};

export function SubmissionPeriodCard({
  buildingLabel,
  value,
  onSave,
  onDelete,
  saving,
  deleting,
  bare,
  hideHeader,
}: SubmissionPeriodCardProps) {
  const [startDate, setStartDate] = React.useState(value?.startDate ?? "");
  const [endDate, setEndDate] = React.useState(value?.endDate ?? "");
  const [monthly, setMonthly] = React.useState(value?.monthly ?? false);

  React.useEffect(() => {
    setStartDate(value?.startDate ?? "");
    setEndDate(value?.endDate ?? "");
    setMonthly(value?.monthly ?? false);
  }, [value?.startDate, value?.endDate, value?.monthly]);

  const summary =
    startDate && endDate ? `${formatDate(startDate)} — ${formatDate(endDate)}` : "—";

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
            {buildingLabel && (
              <div className="truncate text-sm font-semibold text-slate-900">{buildingLabel}</div>
            )}
            <div className="text-xs text-slate-500">{summary}</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
          Дата открытия
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
          Дата закрытия
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className={inputClass}
          />
        </label>
      </div>

      <label className="mt-4 inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={monthly}
          onChange={(e) => setMonthly(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
        />
        Подавать каждый месяц
      </label>
      {monthly && startDate && endDate && (
        <p className="mt-1.5 text-xs text-slate-500">
          Период будет автоматически повторяться с {new Date(startDate).getDate()} по{" "}
          {new Date(endDate).getDate()} число каждого месяца.
        </p>
      )}

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
            {deleting ? "Удаление…" : "Удалить период"}
          </Button>
        )}
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={saving || (!startDate && !endDate)}
          onClick={() => onSave({ startDate, endDate, monthly })}
        >
          {saving ? "Сохранение…" : "Сохранить"}
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
