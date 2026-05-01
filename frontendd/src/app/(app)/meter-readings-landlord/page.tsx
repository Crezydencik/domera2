import { getTranslations } from "next-intl/server";
import { DataTable } from "@/components/data-table";
import { SectionCard } from "@/components/section-card";
import { getRoleDataBundle } from "@/shared/lib/domera-api.server";

export default async function OwnerLandlordMeterReadingsPage() {
  const t = await getTranslations("meterReadings");
  
  const data = await getRoleDataBundle("resident");

  return (
    <SectionCard title={t("ownerLandlordTitle")} description={t("ownerLandlordDescription")}>
      {data.meterReadings.length > 0 ? (
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
          pageSize={10}
        />
      ) : (
        <p className="text-sm text-gray-500">No meter readings available</p>
      )}
    </SectionCard>
  );
}
