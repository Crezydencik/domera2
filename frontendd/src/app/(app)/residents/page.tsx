import { getTranslations } from "next-intl/server";
import { DataTable } from "@/components/data-table";
import { SectionCard } from "@/components/section-card";
import { getRoleDataBundle } from "@/shared/lib/domera-api.server";

export default async function ResidentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ role?: string }>;
}) {
  const t = await getTranslations("residents");
  const params = (await searchParams) ?? {};
  const data = await getRoleDataBundle(params.role);

  return (
    <div className="space-y-6">
      <SectionCard title={t("title")} description={t("description")}>
        <DataTable
          columns={[t("colResident"), t("colApartment"), t("colBuilding"), t("colRole"), t("colInvitation")]}
          rows={data.residents.map((item) => [
            <div key={`${item.id}-user`}>
              <p className="font-medium text-slate-900">{item.fullName}</p>
              <p className="text-xs text-slate-500">{item.id}</p>
            </div>,
            item.apartment,
            item.building,
            item.role,
            <span
              key={`${item.id}-status`}
              className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700"
            >
              {item.invitationStatus}
            </span>,
          ])}
        />
      </SectionCard>
    </div>
  );
}
