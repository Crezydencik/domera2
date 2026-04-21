import { SectionCard } from "@/components/section-card";
import { getRoleDataBundle } from "@/shared/lib/domera-api.server";

export default async function DebtsPage({
  searchParams,
}: {
  searchParams?: Promise<{ role?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const data = await getRoleDataBundle(params.role);
  const debts = data.invoices.filter((item) => item.status !== "Paid").slice(0, 6);

  return (
    <div className="space-y-6">
      <SectionCard title="Debts" description="Track overdue balances and payment recovery status.">
        {debts.length ? (
          <div className="grid gap-3 md:grid-cols-3">
            {debts.map((item) => (
              <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm text-slate-500">{item.apartment}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{item.amount}</p>
                <p className="mt-2 text-sm text-rose-600">{item.status}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No active debts for this role.</p>
        )}
      </SectionCard>
    </div>
  );
}
