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
  /** Optional footer slot (e.g. results count). */
  footer?: React.ReactNode;
}

const inputBase =
  "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";

export function FilterBar({ fields, values, onChange, actions, footer }: FilterBarProps) {
  const visibleFields = fields.filter((f) => f.visible !== false);

  return (
    <div className="mb-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap">
          {visibleFields.map((field) => {
            const value = values[field.name] ?? "";
            if (field.type === "search") {
              return (
                <div key={field.name} className={field.className ?? "relative w-full sm:w-64"}>
                  <svg
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
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
                    className={`${inputBase} w-full pl-9 pr-3 placeholder:text-slate-400`}
                  />
                </div>
              );
            }
            return (
              <select
                key={field.name}
                value={value}
                onChange={(e) => onChange(field.name, e.target.value)}
                className={`${inputBase} ${field.className ?? ""}`}
              >
                {field.placeholder && <option value="">{field.placeholder}</option>}
                {field.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            );
          })}
        </div>

        {actions && <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-2">{actions}</div>}
      </div>

      {footer && <div className="text-xs uppercase tracking-wide text-slate-500">{footer}</div>}
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
