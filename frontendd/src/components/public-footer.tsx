import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";

export async function PublicFooter() {
  const t = await getTranslations("home");

  return (
    <footer className="border-t border-slate-100 py-8">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 text-sm text-slate-400 md:flex-row">
        <div className="flex items-center gap-2">
          <span>🏠</span>
          <span className="font-semibold text-slate-600">Domera</span>
        </div>
        <span>{t("footerRights")}</span>
        <LocaleSwitcher />
      </div>
    </footer>
  );
}
