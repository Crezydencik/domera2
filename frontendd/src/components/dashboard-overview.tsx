import { getTranslations } from "next-intl/server";
import { SectionCard } from "@/components/section-card";
import { documents, notifications } from "@/shared/lib/data";

export async function DashboardOverview() {
  const t = await getTranslations("dashboard");

  const stats = [
    { label: t("statBuildings"), value: "12", hint: t("statBuildingsHint"), tone: "border-sky-200 bg-sky-50/70" },
    { label: t("statApartments"), value: "286", hint: t("statApartmentsHint"), tone: "border-emerald-200 bg-emerald-50/70" },
    { label: t("statOpenInvoices"), value: "41", hint: t("statOpenInvoicesHint"), tone: "border-amber-200 bg-amber-50/70" },
    { label: t("statUnreadAlerts"), value: "9", hint: t("statUnreadAlertsHint"), tone: "border-rose-200 bg-rose-50/70" },
  ];

  const blocks = [t("block1"), t("block2"), t("block3"), t("block4")];

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className={`rounded-lg border p-5 shadow-sm shadow-slate-950/[0.03] ${stat.tone}`}
          >
            <p className="text-sm font-medium text-slate-600">{stat.label}</p>
            <p className="mt-2 text-3xl font-semibold text-slate-950">{stat.value}</p>
            <p className="mt-2 text-sm leading-5 text-slate-600">{stat.hint}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <SectionCard
          title={t("operationalPulse")}
          description={t("operationalPulseDesc")}
        >
          <div className="grid gap-3 md:grid-cols-2">
            {blocks.map((item) => (
              <div key={item} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                {item}
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title={t("latestAlerts")} description={t("latestAlertsDesc")}>
          <div className="space-y-3">
            {notifications.map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-slate-950">{item.title}</p>
                  <span className="rounded-full bg-sky-100 px-2 py-1 text-xs font-medium text-sky-700">{item.channel}</span>
                </div>
                <p className="mt-1 text-sm leading-5 text-slate-600">{item.description}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      </section>

      <SectionCard title={t("documentCenter")} description={t("documentCenterDesc")}>
        <div className="grid gap-3 md:grid-cols-3">
          {documents.map((item) => (
            <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-950">{item.title}</p>
              <p className="mt-1 text-sm text-slate-600">{item.type}</p>
              <p className="mt-3 text-xs text-slate-500">{item.target}</p>
              <p className="mt-1 text-xs font-medium text-sky-700">{t("updated", { date: item.updatedAt })}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
