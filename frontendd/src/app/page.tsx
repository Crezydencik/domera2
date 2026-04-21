import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { PublicHeader } from "@/components/public-heder";
import { PublicFooter} from "@/components/public-footer";
import { Button } from "@/components/ui/button";
import { ROUTES } from "../shared/lib/routes";

const heroCards = [
  { icon: "∞", color: "bg-blue-50 border-blue-100", iconColor: "text-blue-500", titleKey: "f1Title" as const, descKey: "f1Desc" as const },
  { icon: "🔒", color: "bg-green-50 border-green-100", iconColor: "text-green-600", titleKey: "f2Title" as const, descKey: "f2Desc" as const },
  { icon: "⚡", color: "bg-rose-50 border-rose-100", iconColor: "text-orange-500", titleKey: "f3Title" as const, descKey: "f3Desc" as const },
];

const featureIcons = ["🏢", "💧", "💰", "📂", "💬", "🔐"];

export default async function HomePage() {
  const t = await getTranslations("home");

  const mgmtItems = t("forMgmtItems").split("|").slice(0, 4);
  const resItems = t("forResItems").split("|");

  const features = [
    { icon: featureIcons[0], title: t("f1Title"), desc: t("f1Desc") },
    { icon: featureIcons[1], title: t("f2Title"), desc: t("f2Desc") },
    { icon: featureIcons[2], title: t("f3Title"), desc: t("f3Desc") },
    { icon: featureIcons[3], title: t("f4Title"), desc: t("f4Desc") },
    { icon: featureIcons[4], title: t("f5Title"), desc: t("f5Desc") },
    { icon: featureIcons[5], title: t("f6Title"), desc: t("f6Desc") },
  ];

  const stats = [
    { value: t("stat1Value"), label: t("stat1Label") },
    { value: t("stat2Value"), label: t("stat2Label") },
    { value: t("stat3Value"), label: t("stat3Label") },
    { value: t("stat4Value"), label: t("stat4Label") },
  ];

  const steps = [
    { num: "01", title: t("step1"), desc: t("step1Desc") },
    { num: "02", title: t("step2"), desc: t("step2Desc") },
    { num: "03", title: t("step3"), desc: t("step3Desc") },
  ];

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <PublicHeader />

      {/* ── HERO ── */}
      <section className="bg-linear-to-br from-slate-50 via-blue-50/40 to-white py-16 md:py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid items-center gap-12 md:grid-cols-2">
            {/* Left */}
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
                ✨ {t("heroBadge")}
              </span>

              <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight text-slate-900 md:text-5xl">
                {t("heroTitle")}{" "}
                <span className="text-blue-600">{t("heroCta").replace(" →", "").split(" ").pop()}</span>
              </h1>

              <p className="mt-4 text-base leading-7 text-slate-500">
                {t("heroDesc")}
              </p>

              <ul className="mt-6 space-y-2.5">
                {mgmtItems.map((item) => (
                  <li key={item} className="flex items-center gap-3 text-sm font-medium text-slate-700">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white text-[10px]">✓</span>
                    {item}
                  </li>
                ))}
              </ul>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link href={ROUTES.register}>
                  <Button variant="primary" size="lg">{t("heroCta")}</Button>
                </Link>
                <Link href={ROUTES.login}>
                  <Button variant="secondary" size="lg">{t("heroCtaSecondary")}</Button>
                </Link>
              </div>
            </div>

            {/* Right — feature cards */}
            <div className="flex flex-col gap-4">
              {heroCards.map((card) => (
                <div key={card.titleKey} className={`flex items-start gap-4 rounded-2xl border p-5 ${card.color}`}>
                  <span className={`text-2xl ${card.iconColor}`}>{card.icon}</span>
                  <div>
                    <p className="font-semibold text-slate-800">{t(card.titleKey)}</p>
                    <p className="mt-0.5 text-sm text-slate-500">{t(card.descKey)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS ── */}
      <section className="border-y border-slate-100 py-14">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 px-6 md:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-4xl font-bold text-blue-600">{s.value}</p>
              <p className="mt-1.5 text-sm text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-slate-900 md:text-4xl">{t("featuresTitle")}</h2>
            <p className="mt-3 text-slate-500">{t("featuresDesc")}</p>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-slate-100 bg-slate-50 p-6 transition hover:border-blue-100 hover:bg-blue-50/30"
              >
                <span className="text-3xl">{f.icon}</span>
                <h3 className="mt-4 text-base font-semibold text-slate-800">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOR WHO ── */}
      <section className="bg-slate-50 py-24">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="mb-10 text-center text-3xl font-bold text-slate-900 md:text-4xl">
            {t("forTitle")}
          </h2>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-8">
              <div className="mb-5 flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-xl">🏗️</span>
                <h3 className="text-lg font-semibold text-slate-800">{t("forMgmtTitle")}</h3>
              </div>
              <ul className="space-y-3">
                {t("forMgmtItems").split("|").map((item) => (
                  <li key={item} className="flex items-center gap-3 text-sm text-slate-600">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-8">
              <div className="mb-5 flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-xl">🏠</span>
                <h3 className="text-lg font-semibold text-slate-800">{t("forResTitle")}</h3>
              </div>
              <ul className="space-y-3">
                {resItems.map((item) => (
                  <li key={item} className="flex items-center gap-3 text-sm text-slate-600">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="py-24">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="mb-14 text-center text-3xl font-bold text-slate-900 md:text-4xl">
            {t("howTitle")}
          </h2>

          <div className="grid gap-6 md:grid-cols-3">
            {steps.map((step, idx) => (
              <div key={step.num} className="relative text-center">
                {idx < steps.length - 1 && (
                  <div className="absolute left-[calc(50%+48px)] top-7 hidden h-px w-[calc(100%-96px)] bg-linear-to-r from-blue-200 to-transparent md:block" />
                )}
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-xl font-bold text-white">
                  {step.num}
                </div>
                <h3 className="mt-5 text-base font-semibold text-slate-800">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="bg-blue-600 py-20">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <h2 className="text-3xl font-bold text-white md:text-4xl">{t("ctaTitle")}</h2>
          <p className="mt-4 text-blue-100">{t("ctaDesc")}</p>
          <div className="mt-8">
            <Link href={ROUTES.register}>
              <button className="rounded-xl bg-white px-8 py-3.5 text-sm font-semibold text-blue-600 shadow-sm transition hover:bg-blue-50">
                {t("ctaBtn")}
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <PublicFooter />
    </div>
  );
}
