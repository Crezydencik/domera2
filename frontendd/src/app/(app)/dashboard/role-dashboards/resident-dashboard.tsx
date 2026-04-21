import { MiniBadge, StatCard, SurfaceCard } from "./shared";
import type { RoleDataBundle } from "@/shared/lib/domera-api.server";

export function ResidentDashboard({ data }: { data: RoleDataBundle }) {
  const currentApartment = data.apartments[0] ?? {};
  const nextInvoice = data.invoices.find((item) => item.status !== "Paid") ?? data.invoices[0];
  const latestReading = data.meterReadings[0];

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-blue-200 bg-blue-50/80 p-5 shadow-sm">
        <p className="text-sm font-medium text-blue-700">Resident view</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">My apartment and payments</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Quick access to invoices, meter readings, building notices and the latest documents from management.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Apartment" value={String(currentApartment.number ?? currentApartment.id ?? "—")} hint={String(currentApartment.address ?? currentApartment.buildingId ?? "No building linked")} accent="blue" />
        <StatCard label="Next Invoice" value={nextInvoice?.amount ?? "€0.00"} hint={nextInvoice ? `Due on ${nextInvoice.dueDate}` : "No invoices yet"} accent="orange" />
        <StatCard label="Meter Status" value={latestReading ? "Sent" : "Pending"} hint={latestReading ? `Updated ${latestReading.submittedAt}` : "No reading submitted"} accent="green" />
        <StatCard label="Unread Notices" value={String(data.notifications.length)} hint="Latest building messages and updates" accent="purple" />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <SurfaceCard title="My checklist">
          <div className="space-y-3 text-sm text-slate-600">
            {[
              latestReading ? `Last reading recorded on ${latestReading.submittedAt}` : "Submit your meter reading",
              nextInvoice ? `Review invoice ${nextInvoice.id}` : "No invoice pending right now",
              "Check latest building maintenance notice",
            ].map((item) => (
              <div key={item} className="flex items-center justify-between rounded-2xl border border-slate-100 p-3">
                <span>{item}</span>
                <MiniBadge>Open</MiniBadge>
              </div>
            ))}
          </div>
        </SurfaceCard>

        <SurfaceCard title="Recent documents">
          <div className="space-y-3">
            {[
              ["April utility statement", "Invoice"],
              ["House rules update", "PDF"],
              ["Water shutdown notice", "Notice"],
            ].map(([title, type]) => (
              <div key={title} className="rounded-2xl border border-slate-100 p-3">
                <p className="font-medium text-slate-900">{title}</p>
                <p className="mt-1 text-sm text-slate-500">{type}</p>
              </div>
            ))}
          </div>
        </SurfaceCard>
      </section>
    </div>
  );
}
