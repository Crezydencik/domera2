import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FiArrowRight } from "react-icons/fi";
import { ROUTES } from "@/shared/lib/routes";
import { navItems } from "./landing-data";
import { LandingLogo } from "./landing-logo";

export async function LandingFooter() {
  const t = await getTranslations("landing");

  return (
    <footer className="bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid gap-10 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <LandingLogo imageClassName="brightness-0 invert" />
            <h2 className="mt-8 max-w-2xl text-3xl font-bold leading-tight text-white md:text-5xl">
              {t("footer.title")}
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-8 text-slate-300 md:text-lg">
              {t("footer.description")}
            </p>
          </div>

          <Link
            href={ROUTES.register}
            className="inline-flex min-h-14 items-center justify-center gap-3 rounded-2xl bg-white px-7 text-base font-bold text-slate-950 transition hover:bg-blue-50"
            style={{ color: "#020617" }}
          >
            {t("footer.cta")}
            <FiArrowRight className="h-5 w-5" aria-hidden="true" />
          </Link>
        </div>

        <div className="mt-12 flex flex-col gap-6 border-t border-white/10 pt-8 md:flex-row md:items-center md:justify-between">
          <nav className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold text-slate-300" aria-label="Навигация в подвале">
            {navItems.map((item) => (
              <a key={item.href} href={item.href} className="transition hover:text-white">
                {t(`nav.${item.key}`)}
              </a>
            ))}
          </nav>
          <div className="flex flex-wrap gap-x-5 gap-y-3 text-sm text-slate-400">
            <Link href={ROUTES.privacyPolicy} className="hover:text-white">
              {t("footer.privacy")}
            </Link>
            <Link href={ROUTES.termsOfUse} className="hover:text-white">
              {t("footer.terms")}
            </Link>
            <span>{t("footer.rights")}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
