import { SectionCard } from "@/components/section-card";
import { getRoleDataBundle } from "@/shared/lib/domera-api.server";
import type { DocumentItem } from "@/shared/lib/data";

function buildDocuments(data: Awaited<ReturnType<typeof getRoleDataBundle>>): DocumentItem[] {
  const today = new Date().toISOString().slice(0, 10);
  const dynamicItems: DocumentItem[] = [
    {
      id: `${data.role}-summary`,
      title:
        data.role === "managementCompany"
          ? `Portfolio summary for ${data.buildings.length} buildings`
          : data.role === "landlord"
            ? `Owner ledger for ${data.apartments.length || 1} apartments`
            : `Resident account pack for ${data.invoices.length || 1} invoice(s)`,
      type: data.role === "resident" ? "Statement" : "Report",
      target:
        data.role === "managementCompany"
          ? `${data.apartments.length} apartments`
          : data.role === "landlord"
            ? "Owner workspace"
            : "Resident workspace",
      updatedAt: today,
    },
  ];

  return [...dynamicItems, ...data.documents].slice(0, 6);
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ role?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const data = await getRoleDataBundle(params.role);
  const items = buildDocuments(data);

  return (
    <div className="space-y-6">
      <SectionCard title="Documents" description="Central archive for invoices, reports and agreements.">
        <div className="grid gap-3 md:grid-cols-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="font-medium text-slate-900">{item.title}</p>
              <p className="mt-1 text-sm text-slate-500">{item.type}</p>
              <p className="mt-3 text-xs text-slate-500">{item.target}</p>
              <p className="mt-2 text-xs text-slate-400">Updated {item.updatedAt}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
