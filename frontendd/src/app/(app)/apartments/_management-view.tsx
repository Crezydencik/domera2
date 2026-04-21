import Link from "next/link";
import { DataTable } from "@/components/data-table";
import { SectionCard } from "@/components/section-card";
import type { RoleDataBundle } from "@/shared/lib/domera-api.server";
import { ROUTES } from "@/shared/lib/routes";

export function ApartmentsManagementView({ data }: { data: RoleDataBundle }) {
  const rows = (
    data.apartments.length
      ? data.apartments
      : [{ id: "—", number: "—", address: "Nav dzīvokļu" }]
  ).map((item) => {
    const id = String(item.id ?? item.apartmentId ?? item.number ?? "—");
    const tenants = Array.isArray(item.tenants) ? item.tenants.length : 0;
    const owner = String(item.owner ?? item.ownerEmail ?? item.residentId ?? "Nav norādīts");
    const status = item.residentId || tenants > 0 ? "Aizņemts" : "Brīvs";

    return [
      id !== "—" ? (
        <Link
          key={`${id}-apt`}
          href={`${ROUTES.apartments}/${encodeURIComponent(id)}`}
          className="font-medium text-blue-600 hover:underline"
        >
          {String(item.number ?? item.id ?? "—")}
        </Link>
      ) : (
        <span key={`${id}-apt`} className="font-medium text-slate-900">
          {String(item.number ?? item.id ?? "—")}
        </span>
      ),
      String(item.address ?? item.buildingId ?? "—"),
      owner,
      <span
        key={`${id}-status`}
        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
          status === "Aizņemts"
            ? "bg-emerald-100 text-emerald-700"
            : "bg-slate-100 text-slate-600"
        }`}
      >
        {status}
      </span>,
      id !== "—" ? (
        <Link
          key={`${id}-details`}
          href={`${ROUTES.apartments}/${encodeURIComponent(id)}`}
          className="inline-flex rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Informācija
        </Link>
      ) : (
        <span key={`${id}-empty`} className="text-xs text-slate-400">—</span>
      ),
    ];
  });

  return (
    <div className="space-y-6">
      <SectionCard
        title="Dzīvokļu reģistrs"
        description="Visu dzīvokļu saraksts ar aizņemtību un īpašnieku pārskatu."
      >
        <DataTable
          columns={["DZĪVOKLIS", "ĒKA / ADRESE", "ATBILDĪGĀ PERSONA", "STATUSS", "DARBĪBAS"]}
          rows={rows}
        />
      </SectionCard>
    </div>
  );
}
