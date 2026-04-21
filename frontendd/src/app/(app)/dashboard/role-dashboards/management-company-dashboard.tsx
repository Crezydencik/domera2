import { MiniBadge, PlaceholderBarChart, PlaceholderLineChart, StatCard, SurfaceCard } from "./shared";
import type { RoleDataBundle } from "@/shared/lib/domera-api.server";

function parseAmount(value: string): number {
  const numeric = Number(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

export function ManagementCompanyDashboard({ data }: { data: RoleDataBundle }) {
  const apartmentCount = data.apartments.length || data.buildings.reduce((total, item) => total + Number(item.apartments || 0), 0);
  const activeResidents = data.residents.length;
  const totalRevenue = data.invoices.reduce((total, item) => total + parseAmount(item.amount), 0);
  const totalDebt = data.invoices
    .filter((item) => item.status !== "Paid")
    .reduce((total, item) => total + parseAmount(item.amount), 0);
  const readingCoverage = apartmentCount > 0 ? Math.round((data.meterReadings.length / apartmentCount) * 100) : 0;
  const overdueCount = data.invoices.filter((item) => item.status === "Overdue").length;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-orange-200 bg-orange-50/70 p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium text-orange-700">Welcome to Domera</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900">Management company workspace</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Monitor buildings, apartments, invoices and operational issues from one clear control panel.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white">Get started</button>
            <button className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700">Dismiss</button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Total Buildings" value={String(data.buildings.length)} hint="Live portfolio count from backend" accent="orange" />
        <StatCard label="Total Apartments" value={String(apartmentCount)} hint="Synced from apartment registry" accent="blue" />
        <StatCard label="Monthly Revenue" value={new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(totalRevenue)} hint="Calculated from invoice data" accent="green" />
        <StatCard label="Total Debt" value={new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(totalDebt)} hint={`${overdueCount} overdue invoices`} accent="red" />
        <StatCard label="Submitted Readings" value={`${readingCoverage}%`} hint="Coverage based on apartment activity" accent="yellow" />
        <StatCard label="Active Residents" value={String(activeResidents)} hint="Users linked to the company" accent="purple" />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <SurfaceCard title="Payments over time">
          <PlaceholderLineChart />
        </SurfaceCard>
        <SurfaceCard title="Debt distribution">
          <PlaceholderBarChart />
        </SurfaceCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <SurfaceCard title="Priority tasks">
          <div className="space-y-3">
            {[
              [`${overdueCount} overdue invoices need review`, "Billing"],
              [`${Math.max(apartmentCount - data.meterReadings.length, 0)} apartments still need readings`, "Users"],
              [`${data.buildings.length} buildings synced with backend`, "Maintenance"],
            ].map(([title, tag]) => (
              <div key={title} className="flex items-center justify-between rounded-2xl border border-slate-100 p-3">
                <p className="font-medium text-slate-800">{title}</p>
                <MiniBadge>{tag}</MiniBadge>
              </div>
            ))}
          </div>
        </SurfaceCard>

        <SurfaceCard title="Role permissions live">
          <div className="space-y-3 text-sm text-slate-600">
            <div className="rounded-2xl border border-slate-100 p-3">
              <p className="font-medium text-slate-900">Management company</p>
              <p className="mt-1">Full access to buildings, residents, debts, documents and settings.</p>
            </div>
            <div className="rounded-2xl border border-slate-100 p-3">
              <p className="font-medium text-slate-900">Resident</p>
              <p className="mt-1">Sees invoices, readings, documents and notifications only.</p>
            </div>
            <div className="rounded-2xl border border-slate-100 p-3">
              <p className="font-medium text-slate-900">Landlord</p>
              <p className="mt-1">Tracks owned apartments, tenants, invoice status and portfolio health.</p>
            </div>
          </div>
        </SurfaceCard>
      </section>
    </div>
  );
}
