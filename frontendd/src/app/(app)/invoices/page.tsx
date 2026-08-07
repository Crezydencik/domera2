import { DomeraApiError, apiFetch } from "@/shared/server/api-client";
import { getInvoicesPageData } from "@/shared/server/page-loaders/invoices.loader";
import { requireManagementCompanyBuildings } from "@/shared/server/management-building-access";
import { InvoicesWorkspace } from "./_invoices-workspace";

type ListLoadResult = {
  items: Record<string, unknown>[];
  error?: string;
};

async function loadInvoiceList(path: string): Promise<ListLoadResult> {
  try {
    const response = await apiFetch<{ items?: Record<string, unknown>[] }>(path);
    return { items: response.items ?? [] };
  } catch (error) {
    const status = error instanceof DomeraApiError ? ` (${error.status})` : "";
    return { items: [], error: status || " " };
  }
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams?: Promise<{ role?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const data = await getInvoicesPageData(params.role);
  requireManagementCompanyBuildings(data);
  const uploadHistory =
    data.role === "managementCompany" && data.companyId
      ? await loadInvoiceList(
          `/invoices/uploads?companyId=${encodeURIComponent(data.companyId)}&limit=25`,
        )
      : { items: [] };
  const pendingApprovals =
    data.role === "managementCompany" && data.companyId
      ? await loadInvoiceList(
          `/invoices/pending-approvals?companyId=${encodeURIComponent(data.companyId)}&limit=100`,
        )
      : { items: [] };

  return (
    <InvoicesWorkspace
      role={data.role}
      companyId={data.companyId}
      invoices={data.invoices}
      buildings={data.buildings}
      apartments={data.apartments}
      uploadHistory={uploadHistory.items ?? []}
      pendingApprovals={pendingApprovals.items ?? []}
      uploadHistoryError={uploadHistory.error}
      pendingApprovalsError={pendingApprovals.error}
    />
  );
}
