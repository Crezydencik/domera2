import { SectionCard } from "@/components/section-card";
import { getRoleDataBundle } from "@/shared/lib/domera-api.server";
import type { NotificationItem } from "@/shared/lib/data";

function buildNotifications(data: Awaited<ReturnType<typeof getRoleDataBundle>>): NotificationItem[] {
  const overdue = data.invoices.filter((item) => item.status === "Overdue").length;
  const pending = data.invoices.filter((item) => item.status === "Pending").length;
  const missingReadings = Math.max(0, data.apartments.length - data.meterReadings.length);

  const computed: NotificationItem[] = [
    {
      id: `${data.role}-billing`,
      title: overdue > 0 ? `${overdue} overdue invoice(s)` : `${pending} pending invoice(s)`,
      description:
        overdue > 0
          ? "Immediate billing follow-up is required in this workspace."
          : "Billing is up to date, with only routine pending items left.",
      channel: "Billing",
    },
    {
      id: `${data.role}-meters`,
      title: missingReadings > 0 ? `${missingReadings} meter reading(s) missing` : "Meter readings on track",
      description:
        missingReadings > 0
          ? "Some properties still need utility submissions."
          : "All visible utility submissions are currently in sync.",
      channel: "Operations",
    },
  ];

  return [...computed, ...data.notifications].slice(0, 6);
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ role?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const data = await getRoleDataBundle(params.role);
  const items = buildNotifications(data);

  return (
    <div className="space-y-6">
      <SectionCard title="Notifications" description="Role-based alerts, reminders and operational updates.">
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-slate-900">{item.title}</p>
                <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700">{item.channel}</span>
              </div>
              <p className="mt-2 text-sm text-slate-600">{item.description}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
