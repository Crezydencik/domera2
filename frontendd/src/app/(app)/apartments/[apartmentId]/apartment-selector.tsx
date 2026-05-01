"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

interface ApartmentOption {
  id: string;
  label: string;
}

export function ApartmentSelector({
  apartments,
  currentId,
}: {
  apartments: ApartmentOption[];
  currentId: string;
}) {
  const t = useTranslations("apartments.selector");
  const router = useRouter();

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <label htmlFor="apartment-selector" className="text-sm font-medium text-slate-700">
        {t("label")}
      </label>
      <select
        id="apartment-selector"
        value={currentId}
        onChange={(event) => {
          const nextId = event.target.value;
          if (nextId) {
            router.push(`/apartments/${encodeURIComponent(nextId)}`);
          }
        }}
        className="min-w-[320px] rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-800 shadow-sm outline-none transition focus:border-slate-500"
      >
        {apartments.map((apartment) => (
          <option key={apartment.id} value={apartment.id}>
            {apartment.label}
          </option>
        ))}
      </select>
    </div>
  );
}
