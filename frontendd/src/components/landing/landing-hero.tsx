import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FiArrowRight, FiCheckCircle } from "react-icons/fi";
import { ROUTES } from "@/shared/lib/routes";
import { DashboardPreview } from "./dashboard-preview";
import { heroBenefits } from "./landing-data";

export async function LandingHero() {
  const t = await getTranslations("landing.hero");

  return (
    <section className="relative overflow-hidden bg-white pt-32 md:pt-40">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 pb-20 md:pb-24 lg:grid-cols-[0.92fr_1.08fr] lg:gap-14">
        <div>
          {/* <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm">
            <FiZap className="h-4 w-4 text-blue-600" aria-hidden="true" />
            {t("badge")}
          </div> */}

          <h1 className="mt-8 max-w-3xl text-5xl font-bold leading-[1.05] text-slate-950 sm:text-6xl lg:text-7xl">
            {t("title")} <span className="text-blue-600">{t("titleAccent")}</span>
          </h1>

          <p className="mt-7 max-w-2xl text-xl leading-9 text-slate-700">
            {t("description")}
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row text-white">
            <Link
              href={ROUTES.register}
              prefetch={false}
              className="inline-flex min-h-14 touch-manipulation select-none items-center justify-center gap-3 rounded-2xl bg-blue-600 px-7 text-base font-bold text-white shadow-xl shadow-blue-600/25 transition-colors duration-100 hover:bg-blue-700"
            >
              {t("primaryCta")}
              <FiArrowRight className="h-5 w-5" aria-hidden="true" />
            </Link>
          </div>

          <div className="mt-10 grid max-w-3xl grid-cols-1 gap-x-7 gap-y-4 text-base font-medium text-slate-600 sm:grid-cols-2 lg:grid-cols-3">
            {heroBenefits.map((benefit) => (
              <div key={benefit} className="flex items-center gap-3">
                <FiCheckCircle className="h-5 w-5 shrink-0 text-blue-600" aria-hidden="true" />
                <span>{t(`benefits.${benefit}`)}</span>
              </div>
            ))}
          </div>
        </div>

        <DashboardPreview />
      </div>
    </section>
  );
}
