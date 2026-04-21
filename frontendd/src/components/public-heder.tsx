import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/shared/lib/routes";

export async function PublicHeader() {
  const t = await getTranslations("home");

  return (
    <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3.5">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🏠</span>
          <span className="text-lg font-bold tracking-tight text-slate-900">Domera</span>
        </div>

        <div className="flex items-center gap-3">
          <Link href={ROUTES.login}>
            <Button variant="ghost" size="sm" className="text-slate-600">
              {t("login")}
            </Button>
          </Link>
          <Link href={ROUTES.register}>
            <Button variant="primary" size="sm">
              {t("getStarted")}
            </Button>
          </Link>
          <LocaleSwitcher />
        </div>
      </div>
    </header>
  );
}
