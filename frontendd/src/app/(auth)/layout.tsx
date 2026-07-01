import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { FiArrowLeft, FiGrid } from "react-icons/fi";
import { AuthRightPanel } from "@/components/auth/auth-right-panel";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ROUTES } from "@/shared/lib/routes";
import { LandingLogo } from "../../components/landing/landing-logo";
import { LandingLocaleSwitcher } from "../../components/landing/landing-locale-switcher";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("auth");

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#f8fbff] text-slate-950">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(15,23,42,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.045)_1px,transparent_1px)] bg-[size:56px_56px]"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-linear-to-br from-white via-white/85 to-blue-100/70"
      />

      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-7xl flex-col px-5 py-6 sm:px-8">
        <header className="flex items-center justify-between gap-4">
               <LandingLogo className="shrink-0" />

          <div className="flex items-center gap-3">          
            <Link
              href={ROUTES.landing}
              className="hidden items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-slate-950 sm:inline-flex"
            >
              <FiArrowLeft className="h-4 w-4" aria-hidden />
              <span>{t("authBackToHome")}</span>
            </Link>
            <LandingLocaleSwitcher />
          </div>
        </header>

        <main className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[minmax(360px,448px)_minmax(520px,1fr)] lg:gap-20 lg:py-14 xl:gap-28">
          <section className="w-full">{children}</section>
          <section className="hidden lg:block"> 
            <AuthRightPanel />
          </section>
        </main>
      </div>
    </div>
  );
}
