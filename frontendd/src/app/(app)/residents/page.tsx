import { getTranslations } from "next-intl/server";
import { SectionCard } from "@/components/section-card";
import { getRoleDataBundle } from "@/shared/lib/domera-api.server";
import { ResidentsDirectory } from "./_residents-directory";

export default async function ResidentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ role?: string }>;
}) {
  const t = await getTranslations("residents");
  const params = (await searchParams) ?? {};
  const data = await getRoleDataBundle(params.role);

  return (
    <div className="space-y-6 max-sm:-mx-2">
      <SectionCard className="max-sm:!rounded-none max-sm:!border-0 max-sm:!bg-transparent max-sm:!p-0 max-sm:!shadow-none">
        <ResidentsDirectory
          data={data}
          labels={{
            apartment: t("colApartment"),
            fullName: "Vārds, uzvārds",
            email: "E-pasts",
            phone: "Tālrunis",
            building: t("colBuilding"),
            role: "Loma",
            allBuildings: "Visas mājas",
            empty: "Kontaktpersonas pagaidām nav atrastas.",
          }}
        />
      </SectionCard>
    </div>
  );
}
