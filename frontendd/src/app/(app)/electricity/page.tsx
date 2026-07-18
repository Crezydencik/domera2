import { redirect } from "next/navigation";
import { apiFetch, getRoleDataBundle } from "@/shared/lib/domera-api.server";
import { isElectricityEnabledBuilding } from "@/shared/lib/buildings";
import { ROUTES } from "@/shared/lib/routes";
import { ElectricityWorkspace } from "./_electricity-workspace";

type UnknownRecord = Record<string, unknown>;

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

export default async function ElectricityPage({
  searchParams,
}: {
  searchParams?: Promise<{ role?: string; settings?: string; openSettings?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const data = await getRoleDataBundle(params.role);
  const company = data.companyId
    ? await apiFetch<UnknownRecord>(`/company/${encodeURIComponent(data.companyId)}`).catch(() => null)
    : null;
  const hasEnabledElectricityBuilding = data.role === "managementCompany"
    && data.buildings.some((building) => isElectricityEnabledBuilding(building));

  if (!hasEnabledElectricityBuilding) {
    redirect(ROUTES.dashboard);
  }

  return (
    <ElectricityWorkspace
      role={data.role}
      companyId={data.companyId}
      company={{
        companyId: firstString(company?.companyId, company?.id, data.companyId),
        name: firstString(company?.companyName, company?.name, data.profile?.companyName),
        registrationNumber: firstString(company?.registrationNumber, data.profile?.registrationNumber),
        address: firstString(company?.address, company?.companyAddress, data.profile?.companyAddress),
        bankName: firstString(company?.bankName, data.profile?.bankName),
        bankAccountIban: firstString(company?.bankAccountIban, company?.iban, data.profile?.bankAccountIban),
        bankSwift: firstString(company?.bankSwift, company?.swift, company?.bic, data.profile?.bankSwift),
        bankBeneficiary: firstString(company?.bankBeneficiary, company?.beneficiaryName, data.profile?.bankBeneficiary),
        invoiceSettings: company?.invoiceSettings,
      }}
      buildings={data.buildings}
      apartments={data.apartments}
      invoices={data.invoices}
      initialSettingsOpen={params.settings === "1" || params.openSettings === "1"}
    />
  );
}
