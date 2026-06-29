import { getTranslations } from "next-intl/server";
import { FiCloud, FiGitBranch, FiLock, FiShield } from "react-icons/fi";

const whyDomeraItems = [
  { key: "automation", value: "90%", icon: FiGitBranch },
  { key: "cloud", value: "24/7", icon: FiCloud },
  { key: "transparency", value: "100%", icon: FiShield },
  { key: "security", value: "AES-256", icon: FiLock },
];

export async function WhyDomeraSection() {
  const t = await getTranslations("landing.whyDomera");

  return (
    <section className="bg-white px-6 py-24 md:py-28">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-4xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-blue-600 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-blue-600" aria-hidden="true" />
            {t("eyebrow")}
          </div>
          <h2 className="mt-8 text-4xl font-bold leading-[1.05] text-slate-950 md:text-6xl">
            {t("title")}
          </h2>
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-slate-600 md:text-xl">
            {t("description")}
          </p>
        </div>

        <div className="mt-20 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {whyDomeraItems.map((item) => {
            const Icon = item.icon;

            return (
              <article
                key={item.key}
                className="min-h-[260px] rounded-3xl border border-slate-200 bg-white p-7 shadow-[0_18px_45px_rgba(15,23,42,0.08)] transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-[0_24px_55px_rgba(37,99,235,0.14)]"
              >
                <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/25">
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </span>
                <div className="mt-9 text-4xl font-bold leading-none text-slate-950">
                  {item.value}
                </div>
                <h3 className="mt-5 text-xl font-bold text-slate-950">
                  {t(`items.${item.key}.title`)}
                </h3>
                <p className="mt-4 text-base leading-7 text-slate-600">
                  {t(`items.${item.key}.description`)}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
