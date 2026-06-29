import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FiArrowRight, FiCheckCircle } from "react-icons/fi";
import { ROUTES } from "@/shared/lib/routes";
import { pricingPlans } from "./landing-data";
import { SectionHeading } from "./section-heading";

export async function PricingSection() {
  const t = await getTranslations("landing.pricing");

  return (
    <section id="pricing" className="bg-white py-24">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeading
          eyebrow={t("eyebrow")}
          title={t("title")}
          description={t("description")}
        />

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {pricingPlans.map((plan) => (
            <article
              key={plan.key}
              className={`rounded-3xl border p-8 shadow-sm ${
                plan.featured
                  ? "border-blue-600 bg-blue-600 text-white shadow-2xl shadow-blue-600/25"
                  : "border-slate-200 bg-white text-slate-950"
              }`}
            >
              <p className={`text-sm font-bold uppercase tracking-[0.16em] ${plan.featured ? "text-blue-100" : "text-blue-600"}`}>
                {t(`plans.${plan.key}.name`)}
              </p>
              <div className="mt-5 flex items-end gap-2">
                <span className="text-4xl font-bold">{plan.priceKey ? t(plan.priceKey) : plan.price}</span>
                {plan.price?.startsWith("€") ? <span className={plan.featured ? "mb-1 text-blue-100" : "mb-1 text-slate-500"}>{t("perMonth")}</span> : null}
              </div>
              <p className={`mt-3 text-base ${plan.featured ? "text-blue-50" : "text-slate-600"}`}>{t(`plans.${plan.key}.caption`)}</p>

              <ul className="mt-8 space-y-4">
                {plan.featureKeys.map((feature) => (
                  <li key={feature} className="flex items-center gap-3 text-sm font-semibold">
                    <FiCheckCircle className={`h-5 w-5 shrink-0 ${plan.featured ? "text-white" : "text-blue-600"}`} aria-hidden="true" />
                    {t(`plans.${plan.key}.features.${feature}`)}
                  </li>
                ))}
              </ul>

              <Link
                href={ROUTES.register}
                className={`mt-9 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl px-5 text-sm font-bold transition ${
                  plan.featured
                    ? "bg-white text-blue-600 hover:bg-blue-50"
                    : "border border-slate-200 bg-slate-50 text-slate-950 hover:border-blue-200 hover:bg-blue-50"
                }`}
              >
                {t("cta")}
                <FiArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
