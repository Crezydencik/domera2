import { getTranslations } from "next-intl/server";
import { DataTable } from "@/components/data-table";
import { SectionCard } from "@/components/section-card";
import { getRoleDataBundle } from "@/shared/lib/domera-api.server";

export default async function BuildingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ role?: string }>;
}) {
  const t = await getTranslations("buildings");
  const params = (await searchParams) ?? {};
  const data = await getRoleDataBundle(params.role);

  return (
    <div className="space-y-6">
      <SectionCard title={t("title")} description={t("description")}>
        <DataTable
          columns={[t("colBuilding"), t("colAddress"), t("colApartments"), t("colOccupancy"), t("colStatus")]}
          rows={data.buildings.map((item) => [
            <div key={`${item.id}-name`}>
              <p className="font-medium text-slate-900">{item.name}</p>
              <p className="text-xs text-slate-500">{item.id}</p>
            </div>,
            item.address,
            String(item.apartments),
            item.occupancy,
            <span
              key={`${item.id}-status`}
              className={`rounded-full px-2 py-1 text-xs font-medium ${
                item.status === "Healthy" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
              }`}
            >
              {item.status === "Healthy" ? t("healthy") : t("needsReview")}
            </span>,
          ])}
        />
      </SectionCard>
    </div>
  );
}
