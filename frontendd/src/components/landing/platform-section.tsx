import { getTranslations } from "next-intl/server";
import { FiArrowRight } from "react-icons/fi";
import { platformStats, trustItems, workflowItems } from "./landing-data";
import { SectionHeading } from "./section-heading";

export async function PlatformSection() {
  const t = await getTranslations("landing.platform");

  return (
    <section id="platform" className="bg-white py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid items-start gap-12 lg:grid-cols-[0.92fr_1.08fr]">
          <div className="lg:sticky lg:top-32">
            <SectionHeading
              align="left"
              eyebrow={t("eyebrow")}
              title={t("title")}
              description={t("description")}
            />

            <div className="mt-8 flex flex-wrap gap-3">
              {trustItems.map((item) => {
                const Icon = item.icon;

                return (
                  <div key={item.key} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
                    <Icon className="h-4 w-4 text-blue-600" aria-hidden="true" />
                    {t(`trust.${item.key}`)}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              {platformStats.map((stat) => (
                <div key={stat.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
                  <p className="text-4xl font-bold text-slate-950">{stat.value}</p>
                  <p className="mt-2 text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">{t(`stats.${stat.key}`)}</p>
                </div>
              ))}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-950 p-6 text-white shadow-2xl shadow-slate-950/20 md:p-8">
              <div className="mb-8 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-200">{t("workflowEyebrow")}</p>
                  <h3 className="mt-2 text-2xl font-bold">{t("workflowTitle")}</h3>
                </div>
                <span className="hidden rounded-full bg-white/10 p-3 text-blue-200 sm:inline-flex">
                  <FiArrowRight className="h-5 w-5" aria-hidden="true" />
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {workflowItems.map((item, index) => {
                  const Icon = item.icon;

                  return (
                    <article key={item.key} className="rounded-2xl border border-white/10 bg-white/[0.06] p-5">
                      <div className="flex items-center justify-between gap-3">
                        <Icon className="h-6 w-6 text-blue-200" aria-hidden="true" />
                        <span className="text-sm font-bold text-white/40">0{index + 1}</span>
                      </div>
                      <h4 className="mt-5 text-lg font-bold">{t(`workflow.${item.key}.title`)}</h4>
                      <p className="mt-3 text-sm leading-6 text-slate-300">{t(`workflow.${item.key}.description`)}</p>
                    </article>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
