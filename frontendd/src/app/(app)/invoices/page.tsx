import { apiFetch, getRoleDataBundle } from "@/shared/lib/domera-api.server";
import { InvoicesWorkspace } from "./_invoices-workspace";

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams?: Promise<{ role?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const data = await getRoleDataBundle(params.role);
  const uploadHistory =
    data.role === "managementCompany" && data.companyId
      ? await apiFetch<{ items?: Record<string, unknown>[] }>(
          `/invoices/uploads?companyId=${encodeURIComponent(data.companyId)}&limit=25`,
        ).catch(() => ({ items: [] }))
      : { items: [] };
  const pendingApprovals =
    data.role === "managementCompany" && data.companyId
      ? await apiFetch<{ items?: Record<string, unknown>[] }>(
          `/invoices/pending-approvals?companyId=${encodeURIComponent(data.companyId)}&limit=100`,
        ).catch(() => ({ items: [] }))
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
    />
  );
}
