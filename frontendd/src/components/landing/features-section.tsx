import { getTranslations } from "next-intl/server";
import { featureItems } from "./landing-data";
import { SectionHeading } from "./section-heading";

export async function FeaturesSection() {
  const t = await getTranslations("landing.features");

  return (
    <section id="features" className="border-y border-slate-100 bg-slate-50/70 py-24">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeading
          eyebrow={t("eyebrow")}
          title={t("title")}
          description={t("description")}
        />

        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {featureItems.map((item) => {
            const Icon = item.icon;

            return (
              <article
                key={item.key}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-600/10"
              >
                <span className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ring-1 ${item.accent}`}>
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-xl font-bold text-slate-950">{t(`items.${item.key}.title`)}</h3>
                <p className="mt-3 text-base leading-7 text-slate-600">{t(`items.${item.key}.description`)}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
