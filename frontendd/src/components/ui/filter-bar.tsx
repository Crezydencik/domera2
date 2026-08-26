"use client";

import React from "react";

/**
 * Generic, reusable filter bar.
 *
 * Define filter fields declaratively via the `fields` prop, hold the values
 * in a single record (`values`) on the parent and react to changes via `onChange`.
 *
 * Adding a new filter later is as simple as appending another entry to `fields`.
 */

export type FilterOption = {
  value: string;
  label: string;
};

type BaseField = {
  name: string;
  /** When false, the field is not rendered (useful e.g. when only one building). */
  visible?: boolean;
  /** Tailwind width class for the wrapper (optional). */
  className?: string;
};

export type SearchField = BaseField & {
  type: "search";
  placeholder?: string;
};

export type SelectField = BaseField & {
  type: "select";
  options: FilterOption[];
  placeholder?: string;
};

export type FilterField = SearchField | SelectField;

export type FilterValues = Record<string, string>;

interface FilterBarProps {
  fields: FilterField[];
  values: FilterValues;
  onChange: (name: string, value: string) => void;
  /** Optional right-aligned slot for action buttons. */
  actions?: React.ReactNode;
  actionsClassName?: string;
  mobileActionsInline?: boolean;
  /** Optional footer slot (e.g. results count). */
  footer?: React.ReactNode;
}

const inputBase =
  "h-11 rounded-2xl border border-slate-200 bg-white text-sm font-medium text-slate-900 shadow-sm shadow-slate-950/[0.03] outline-none transition hover:border-slate-300 hover:bg-white focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100";

export function FilterBar({ fields, values, onChange, actions, actionsClassName, mobileActionsInline, footer }: FilterBarProps) {
  const visibleFields = fields.filter((f) => f.visible !== false);
  const resolvedActionsClassName = actionsClassName ?? "grid grid-cols-2 gap-2 sm:grid-cols-4 xl:flex xl:flex-wrap xl:justify-end";
  const fieldsClassName = mobileActionsInline
    ? "flex flex-col gap-3 md:contents"
    : "flex flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap";
  const controlsClassName = mobileActionsInline
    ? "flex flex-col gap-3 md:grid md:grid-cols-[minmax(16rem,1fr)_minmax(12rem,18rem)_auto] md:items-start md:gap-2"
    : "flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between";

  return (
    <div className="mb-6 space-y-4">
      <div className={controlsClassName}>
        <div className={fieldsClassName}>
          {visibleFields.map((field) => {
            const value = values[field.name] ?? "";
            if (field.type === "search") {
              return (
                <div key={field.name} className={field.className ?? (mobileActionsInline ? "relative min-w-0 w-full" : "relative w-full sm:w-64")}>
                  <svg
                    className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="11" cy="11" r="7" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                  <input
                    type="text"
                    placeholder={field.placeholder}
                    value={value}
                    onChange={(e) => onChange(field.name, e.target.value)}
                    className={`${inputBase} w-full pl-11 pr-4 placeholder:text-slate-400`}
                  />
                </div>
              );
            }
            return (
              <div
                key={field.name}
                className={field.className ?? (mobileActionsInline ? "relative min-w-0 w-full" : "relative w-full sm:w-64")}
              >
                <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-slate-400">
                  <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
                    <path d="M3.5 5.5h13M6.5 10h7M8.5 14.5h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </span>
                <select
                  value={value}
                  onChange={(e) => onChange(field.name, e.target.value)}
                  className={`${inputBase} w-full appearance-none pl-11 pr-11 ${mobileActionsInline ? "min-w-0 text-sm md:truncate" : ""}`}
                >
                  {field.placeholder && <option value="">{field.placeholder}</option>}
                  {field.options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-slate-400">
                  <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
                    <path d="m5.75 8 4.25 4.25L14.25 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </div>
            );
          })}
        </div>

        {actions && <div className={resolvedActionsClassName}>{actions}</div>}
      </div>

      {footer && <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{footer}</div>}
    </div>
  );
}

/**
 * Lightweight helper for managing many filter values in one piece of state.
 *
 * Usage:
 *   const { values, setValue } = useFilters({ search: "", building: "", status: "all" });
 *   <FilterBar fields={...} values={values} onChange={setValue} />
 *   const status = values.status; // pull whichever filter you need
 */
export function useFilters<T extends FilterValues>(initial: T) {
  const [values, setValues] = React.useState<T>(initial);
  const setValue = React.useCallback((name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  }, []);
  const reset = React.useCallback(() => setValues(initial), [initial]);
  return { values, setValue, setValues, reset };
}
