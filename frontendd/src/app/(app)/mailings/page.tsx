import { redirect } from "next/navigation";
import { getResidentsPageData } from "@/shared/server/page-loaders/residents.loader";
import { requireManagementCompanyBuildings } from "@/shared/server/management-building-access";
import { ROUTES } from "@/shared/lib/routes";
import { apiFetch } from "@/shared/server/api-client";
import { MailingsWorkspace } from "./mailings-workspace";

function isAccountantRole(value: unknown) {
  return String(value ?? "").replace(/[^a-z]/gi, "").toLowerCase() === "accountant";
}

export default async function MailingsPage({ searchParams }: { searchParams?: Promise<{ role?: string }> }) {
  const params = (await searchParams) ?? {};
  const data = await getResidentsPageData(params.role);
  if (data.role !== "managementCompany" || isAccountantRole(data.rawRole)) redirect(ROUTES.dashboard);
  requireManagementCompanyBuildings(data);

  const company = data.companyId
    ? await apiFetch<Record<string, unknown>>(`/company/${encodeURIComponent(data.companyId)}`).catch(() => null)
    : null;

  return <MailingsWorkspace buildings={data.buildings} apartments={data.apartments} residents={data.residents} company={company} />;
}
