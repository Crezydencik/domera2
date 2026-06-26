import Link from "next/link";
import { AuthRightPanel } from "@/components/auth/auth-right-panel";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ROUTES } from "@/shared/lib/routes";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-white lg:flex-row">
      {/* ── LEFT: form panel ── */}
      <div className="flex w-full flex-1 flex-col bg-white lg:flex-none lg:w-[46%] xl:w-[42%]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 sm:px-6 sm:py-4">
          <Link href={ROUTES.landing} className="flex items-center gap-2">
                <img
              src="https://firebasestorage.googleapis.com/v0/b/domera-eb224.firebasestorage.app/o/System%2FDomera_loga.png?alt=media&token=53ccefaa-c38f-490b-9138-010da531327e"
              alt="Domera Logo"
              className="h-7 min-w-0 max-w-[calc(100%_-_4.5rem)] object-contain sm:h-8 sm:max-w-[11rem]"
            />
          </Link>
          <LocaleSwitcher />
        </div>

        {/* Form content */}
        <div className="flex flex-1 items-center justify-center px-5 py-8 sm:px-10 sm:py-10">
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
