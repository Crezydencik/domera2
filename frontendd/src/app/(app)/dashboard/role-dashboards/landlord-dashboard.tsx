import { MiniBadge, StatCard, SurfaceCard } from "./shared";
import type { RoleDataBundle } from "@/shared/lib/domera-api.server";

export function LandlordDashboard({ data }: { data: RoleDataBundle }) {
  const occupiedUnits = data.apartments.filter((item) => {
    const tenants = Array.isArray(item.tenants) ? item.tenants.length : 0;
    return Boolean(item.residentId) || tenants > 0;
  }).length;
  const openIssues = data.invoices.filter((item) => item.status !== "Paid").length;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-emerald-200 bg-emerald-50/80 p-5 shadow-sm">
        <p className="text-sm font-medium text-emerald-700">Landlord view</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Portfolio overview</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Track owned apartments, tenant activity, outstanding balances and monthly performance in one place.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Owned Units" value={String(data.apartments.length || 0)} hint={`Across ${data.buildings.length} buildings`} accent="green" />
        <StatCard label="Occupied" value={`${occupiedUnits} / ${data.apartments.length || 0}`} hint="Based on linked residents and tenants" accent="blue" />
        <StatCard label="Expected Income" value={new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(data.invoices.reduce((total, item) => total + Number(item.amount.replace(/[^\d.-]/g, "") || 0), 0))} hint="Live invoice sum" accent="orange" />
        <StatCard label="Open Issues" value={String(openIssues)} hint="Pending or overdue items" accent="red" />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <SurfaceCard title="Apartment status">
          <div className="space-y-3 text-sm text-slate-600">
            {(data.apartments.length ? data.apartments : [{ id: "—", number: "—", address: "No apartments linked" }]).slice(0, 3).map((item) => {
              const title = `${String(item.number ?? item.id ?? "—")} · ${String(item.address ?? item.buildingId ?? "Unknown building")}`;
              const status = item.residentId || (Array.isArray(item.tenants) && item.tenants.length > 0) ? "Occupied" : "Vacant";
              return (
                <div key={title} className="flex items-center justify-between rounded-2xl border border-slate-100 p-3">
                  <span className="font-medium text-slate-800">{title}</span>
                  <MiniBadge>{status}</MiniBadge>
                </div>
              );
            })}
          </div>
        </SurfaceCard>

        <SurfaceCard title="Tenant activity">
          <div className="space-y-3">
            {[
              ["Meter readings submitted", `${data.meterReadings.length} entries`],
              ["Unread notifications", `${data.notifications.length} items`],
              ["Upcoming payments", `${data.invoices.filter((item) => item.status !== "Paid").length} open invoices`],
            ].map(([title, meta]) => (
              <div key={title} className="rounded-2xl border border-slate-100 p-3">
                <p className="font-medium text-slate-900">{title}</p>
                <p className="mt-1 text-sm text-slate-500">{meta}</p>
              </div>
            ))}
          </div>
        </SurfaceCard>
      </section>
    </div>
  );
}
