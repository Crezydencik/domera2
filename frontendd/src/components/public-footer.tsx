import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { FiFileText, FiHome, FiShield } from "react-icons/fi";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ROUTES } from "@/shared/lib/routes";

export async function PublicFooter() {
  const homeT = await getTranslations("home");
  const authT = await getTranslations("auth");

  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-6 px-6 py-8 text-sm sm:px-8 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700 ring-1 ring-sky-100">
            <FiHome className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="font-bold text-slate-900">Domera</p>
            <p className="truncate text-xs text-slate-500">{homeT("footerRights")}</p>
          </div>
        </div>

        <nav className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center" aria-label="Legal links">
          <Link
            href={ROUTES.privacyPolicy}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 font-semibold text-slate-700 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
          >
            <FiShield className="h-4 w-4" aria-hidden="true" />
            <span>{authT("privacyPolicyTitle")}</span>
          </Link>
          <Link
            href={ROUTES.termsOfUse}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 font-semibold text-slate-700 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
          >
            <FiFileText className="h-4 w-4" aria-hidden="true" />
            <span>{authT("termsOfUseTitle")}</span>
          </Link>
        </nav>

        <div className="flex justify-start lg:justify-end">
          <LocaleSwitcher />
        </div>
      </div>
    </footer>
  );
}
