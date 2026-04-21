import Link from "next/link";
import { AuthRightPanel } from "@/components/auth/auth-right-panel";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ROUTES } from "@/shared/lib/routes";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* ── LEFT: form panel ── */}
      <div className="flex w-full flex-col lg:w-[46%] xl:w-[42%] bg-white">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <Link href={ROUTES.landing} className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
              <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
            </svg>
            <span className="text-lg font-bold text-slate-900">Domera</span>
          </Link>
          <LocaleSwitcher />
        </div>

        {/* Form content */}
        <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-md">{children}</div>
        </div>
      </div>

      {/* ── RIGHT: marketing panel ── */}
      <div className="hidden lg:flex lg:flex-1">
        <AuthRightPanel />
      </div>
    </div>
  );
}
