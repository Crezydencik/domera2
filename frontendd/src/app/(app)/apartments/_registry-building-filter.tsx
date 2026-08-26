"use client";

export interface RegistryBuildingOption {
  id: string;
  label: string;
}

interface RegistryBuildingFilterProps {
  label: string;
  allLabel: string;
  options: RegistryBuildingOption[];
  value?: string;
  onChange: (value?: string) => void;
  compact?: boolean;
  minimal?: boolean;
}

export function RegistryBuildingFilter({
  label,
  allLabel,
  options,
  value,
  onChange,
  compact = false,
  minimal = false,
}: RegistryBuildingFilterProps) {
  return (
    <div className={`flex min-w-0 w-full items-center gap-3 ${compact ? "max-w-[280px]" : "max-w-sm"}`}>
      <div className="relative min-w-0 flex-1">
        {!minimal ? <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</p> : null}
        <select
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value || undefined)}
          aria-label={label}
          className={`w-full appearance-none text-slate-900 outline-none transition hover:border-slate-300 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100 ${
            minimal
              ? "h-11 rounded-2xl border border-slate-200 bg-white pl-11 pr-11 text-sm font-medium shadow-sm shadow-slate-950/[0.03]"
              :
            compact
              ? "h-11 px-4 pr-11 text-sm font-semibold shadow-sm shadow-slate-950/[0.03]"
              : "rounded-2xl border border-slate-200 bg-white px-4 py-3 pr-11 text-sm font-medium shadow-sm shadow-slate-950/[0.03]"
          }`}
        >
          <option value="">{allLabel}</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>

        {minimal ? (
          <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-slate-400">
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
              <path d="M3.5 5.5h13M6.5 10h7M8.5 14.5h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </span>
        ) : null}
        <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-slate-400">
          <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
            <path d="m5.75 8 4.25 4.25L14.25 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
    </div>
  );
}
