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
}

export function RegistryBuildingFilter({
  label,
  allLabel,
  options,
  value,
  onChange,
}: RegistryBuildingFilterProps) {
  const activeOption = options.find((option) => option.id === value);
  const activeLabel = activeOption?.label ?? allLabel;

  return (
    <div className="flex min-w-0 w-full max-w-md items-center gap-3">
      <div className="relative min-w-0 flex-1">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
        <select
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value || undefined)}
          aria-label={label}
          className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 pr-11 text-sm font-medium text-slate-900 outline-none transition hover:border-slate-300 hover:bg-white focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
        >
          <option value="">{allLabel}</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
 

        <span className="pointer-events-none absolute right-7 top-1/2 -translate-y-px text-slate-400">
          <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
            <path d="m5.75 8 4.25 4.25L14.25 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
    </div>
  );
}