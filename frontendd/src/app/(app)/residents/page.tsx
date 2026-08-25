import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { SectionCard } from "@/components/section-card";
import { getResidentsPageData } from "@/shared/server/page-loaders/residents.loader";
import { requireManagementCompanyBuildings } from "@/shared/server/management-building-access";
import { ROUTES } from "@/shared/lib/routes";
import { ResidentsDirectory } from "./_residents-directory";

function isAccountantRole(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/[^a-z]/gi, "")
    .toLowerCase() === "accountant";
}

export default async function ResidentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ role?: string }>;
}) {
  const t = await getTranslations("residents");
  const params = (await searchParams) ?? {};
  const data = await getResidentsPageData(params.role);
  if (isAccountantRole(data.rawRole)) {
    redirect(ROUTES.apartments);
  }
  requireManagementCompanyBuildings(data);

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
