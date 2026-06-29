import { getTranslations } from "next-intl/server";
import { FiChevronDown } from "react-icons/fi";
import { faqItems } from "./landing-data";
import { SectionHeading } from "./section-heading";

export async function FaqSection() {
  const t = await getTranslations("landing.faq");

  return (
    <section id="faq" className="border-t border-slate-100 bg-slate-50 py-24">
      <div className="mx-auto max-w-4xl px-6">
        <SectionHeading
          eyebrow={t("eyebrow")}
          title={t("title")}
          description={t("description")}
        />

        <div className="mt-12 space-y-3">
          {faqItems.map((item) => (
            <details key={item} className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-bold text-slate-950">
                {t(`items.${item}.question`)}
                <FiChevronDown className="h-5 w-5 shrink-0 text-slate-400 transition group-open:rotate-180" aria-hidden="true" />
              </summary>
              <p className="mt-4 text-base leading-7 text-slate-600">{t(`items.${item}.answer`)}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
