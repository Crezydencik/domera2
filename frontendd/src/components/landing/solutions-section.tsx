import { getTranslations } from "next-intl/server";
import { solutionItems } from "./landing-data";
import { SectionHeading } from "./section-heading";

export async function SolutionsSection() {
  const t = await getTranslations("landing.solutions");

  return (
    <section id="solutions" className="bg-slate-50 py-24">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeading
          eyebrow={t("eyebrow")}
          title={t("title")}
          description={t("description")}
        />

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {solutionItems.map((item) => {
            const Icon = item.icon;

            return (
              <article key={item.key} className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
                  <Icon className="h-7 w-7" aria-hidden="true" />
                </span>
                <h3 className="mt-7 text-2xl font-bold text-slate-950">{t(`items.${item.key}.title`)}</h3>
                <p className="mt-4 text-base leading-8 text-slate-600">{t(`items.${item.key}.description`)}</p>
                <div className="mt-8 h-2 rounded-full bg-slate-100">
                  <div className="h-full w-2/3 rounded-full bg-blue-600" />
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
