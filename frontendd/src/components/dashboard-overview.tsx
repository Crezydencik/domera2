import { getTranslations } from "next-intl/server";
import { SectionCard } from "@/components/section-card";
import { documents, notifications } from "@/shared/lib/data";

export async function DashboardOverview() {
  const t = await getTranslations("dashboard");

  const stats = [
    { label: t("statBuildings"), value: "12", hint: t("statBuildingsHint") },
    { label: t("statApartments"), value: "286", hint: t("statApartmentsHint") },
    { label: t("statOpenInvoices"), value: "41", hint: t("statOpenInvoicesHint") },
    { label: t("statUnreadAlerts"), value: "9", hint: t("statUnreadAlertsHint") },
  ];

  const blocks = [t("block1"), t("block2"), t("block3"), t("block4")];

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-slate-950/20"
          >
            <p className="text-sm text-slate-400">{stat.label}</p>
            <p className="mt-2 text-3xl font-semibold text-white">{stat.value}</p>
            <p className="mt-2 text-sm text-cyan-200">{stat.hint}</p>
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
              <div key={item} className="rounded-2xl border border-white/10 bg-slate-950/40 p-3 text-sm text-slate-200">
                {item}
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title={t("latestAlerts")} description={t("latestAlertsDesc")}>
          <div className="space-y-3">
            {notifications.map((item) => (
              <div key={item.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-white">{item.title}</p>
                  <span className="rounded-full bg-cyan-400/15 px-2 py-1 text-xs text-cyan-200">{item.channel}</span>
                </div>
                <p className="mt-1 text-sm text-slate-400">{item.description}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      </section>

      <SectionCard title={t("documentCenter")} description={t("documentCenterDesc")}>
        <div className="grid gap-3 md:grid-cols-3">
          {documents.map((item) => (
            <div key={item.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-sm font-semibold text-white">{item.title}</p>
              <p className="mt-1 text-sm text-slate-400">{item.type}</p>
              <p className="mt-3 text-xs text-slate-500">{item.target}</p>
              <p className="mt-1 text-xs text-cyan-200">{t("updated", { date: item.updatedAt })}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
