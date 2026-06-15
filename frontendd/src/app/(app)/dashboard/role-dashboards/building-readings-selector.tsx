"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

interface BuildingReadingsSelectorProps {
  buildings: Array<{ id: string; label: string }>;
  selectedBuildingId: string;
}

export function BuildingReadingsSelector({ buildings, selectedBuildingId }: BuildingReadingsSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <select
      aria-label="Выбрать дом"
      value={selectedBuildingId}
      onChange={(event) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("buildingId", event.target.value);
        router.replace(`${pathname}?${params.toString()}`);
      }}
      className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-100"
    >
      {buildings.map((building) => (
        <option key={building.id} value={building.id}>
          {building.label}
        </option>
      ))}
    </select>
  );
}
