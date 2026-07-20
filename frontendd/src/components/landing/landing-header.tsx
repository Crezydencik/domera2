import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FiArrowRight } from "react-icons/fi";
import { ROUTES } from "@/shared/lib/routes";
import { navItems } from "./landing-data";
import { LandingLocaleSwitcher } from "./landing-locale-switcher";
import { LandingLogo } from "./landing-logo";

export async function LandingHeader() {
  const t = await getTranslations("landing");

  return (
    <header className="fixed inset-x-0 top-3 z-50 px-4 sm:top-4">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 rounded-[1.75rem] border border-blue-100 bg-white/90 px-4 py-3 shadow-[0_20px_60px_rgba(37,99,235,0.12)] backdrop-blur md:px-5">
        <LandingLogo className="shrink-0" />

        <nav className="hidden items-center gap-8 text-sm font-semibold text-slate-700 lg:flex" aria-label="Главная навигация">
          {navItems.map((item) => (
            <a key={item.href} href={item.href} className="transition hover:text-blue-600">
              {t(`nav.${item.key}`)}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href={ROUTES.login}
            prefetch={false}
            className="inline-flex min-h-11 touch-manipulation select-none items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition-colors duration-100 hover:bg-blue-700 sm:px-5"
            style={{ color: "#fff" }}
          >
            <span className="hidden sm:inline">{t("actions.loginRegister")}</span>
            <span className="sm:hidden">{t("actions.loginRegisterShort")}</span>
            <FiArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <LandingLocaleSwitcher />
        </div>
      </div>
    </header>
  );
}
