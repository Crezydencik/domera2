import { getTranslations } from "next-intl/server";
import { DataTable } from "@/components/data-table";
import { SectionCard } from "@/components/section-card";
import { getRoleDataBundle } from "@/shared/lib/domera-api.server";

export default async function MeterReadingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ role?: string }>;
}) {
  const t = await getTranslations("meterReadings");
  const params = (await searchParams) ?? {};
  const data = await getRoleDataBundle(params.role);

  return (
    <div className="space-y-6">
      <SectionCard title={t("title")} description={t("description")}>
        <DataTable
          columns={[t("colApartment"), t("colValue"), t("colSubmitted"), t("colTrend")]}
          rows={data.meterReadings.map((item) => [
            item.apartment,
            item.value,
            item.submittedAt,
            <span
              key={`${item.id}-trend`}
              className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700"
            >
              {item.trend} m³
            </span>,
          ])}
        />
      </SectionCard>
    </div>
  );
}
