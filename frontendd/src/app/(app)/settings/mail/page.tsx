import { redirect } from "next/navigation";
import { ROUTES } from "@/shared/lib/routes";
import { isApprovedBuilding } from "@/shared/lib/buildings";
import { apiFetch } from "@/shared/server/api-client";
import { getSettingsPageData } from "@/shared/server/page-loaders/settings.loader";
import { MailTemplatesPanel } from "./email-templates-panel";
import type { InvoiceGenerationSettings } from "../lib";

type SettingsMailPageProps = {
  searchParams?: Promise<{ role?: string }>;
};

type CompanyRecord = Record<string, unknown>;

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export default async function SettingsMailPage({ searchParams }: SettingsMailPageProps) {
  const params = (await searchParams) ?? {};
  const data = await getSettingsPageData(params.role);
  const accountType = firstString(data.profile?.accountType, data.profile?.role, data.rawRole).replace(/[^a-z]/gi, "").toLowerCase();

  if (data.role !== "managementCompany" || accountType === "accountant") {
    redirect(ROUTES.dashboard);
  }

  if (!data.buildings.some(isApprovedBuilding)) {
    redirect(ROUTES.dashboard);
  }

  const companyId = firstString(data.companyId, data.profile?.companyId, data.userId);
  if (!companyId) redirect(ROUTES.dashboard);

  const company = await apiFetch<CompanyRecord>(`/company/${encodeURIComponent(companyId)}`).catch(() => null);
  if (!company) redirect(ROUTES.dashboard);

  const invoiceSettings = (company.invoiceSettings && typeof company.invoiceSettings === "object"
    ? company.invoiceSettings
    : {}) as InvoiceGenerationSettings;

  return (
    <MailTemplatesPanel
      companyId={companyId}
      initialInvoiceSettings={invoiceSettings}
      initialCompanyName={firstString(company.companyName, company.name)}
      initialCompanyAddress={firstString(company.address, company.companyAddress)}
      initialEmailBrandName={firstString(company.emailBrandName)}
      initialColors={{
        line: firstString(invoiceSettings.emailLineColor, "#155DFC"),
        button: firstString(invoiceSettings.emailButtonColor, "#155DFC"),
        heading: firstString(invoiceSettings.emailHeadingColor, "#0F172A"),
        heading2: firstString(invoiceSettings.emailHeading2Color, "#0F172A"),
        heading3: firstString(invoiceSettings.emailHeading3Color, "#64748B"),
        text: firstString(invoiceSettings.emailTextColor, "#334155"),
      }}
    />
  );
}
