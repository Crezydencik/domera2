"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { LogoutButton } from "@/components/logout-button";
import { useAppNotifications } from "@/shared/hooks/use-app-notifications";
import { ROUTES } from "@/shared/lib/routes";
import { type DashboardRole, normalizeDashboardRole } from "@/shared/role-ui";

interface RoleAwareSidebarProps {
  brand: string;
  title: string;
  description: string;
  defaultRole: DashboardRole;
  children: ReactNode;
}

type NavItem = {
  href: string;
  label: string;
  icon: string;
};

const navByRole: Record<DashboardRole, NavItem[]> = {
  managementCompany: [
    { href: ROUTES.dashboard, label: "Dashboard", icon: "⌂" },
    { href: ROUTES.buildings, label: "Buildings", icon: "▣" },
    { href: ROUTES.apartments, label: "Apartments", icon: "▥" },
    { href: ROUTES.residents, label: "Residents", icon: "◌" },
    { href: ROUTES.meterReadings, label: "Meter Readings", icon: "◔" },
    { href: ROUTES.invoices, label: "Billing / Invoices", icon: "€" },
    { href: ROUTES.debts, label: "Debts", icon: "!" },
    { href: ROUTES.documents, label: "Documents", icon: "▤" },
    { href: ROUTES.notifications, label: "Notifications", icon: "◉" },
    { href: ROUTES.settings, label: "Settings", icon: "⚙" },
  ],
  resident: [
    { href: ROUTES.dashboard, label: "Dashboard", icon: "⌂" },
    { href: ROUTES.apartments, label: "My Apartments", icon: "▥" },
    { href: ROUTES.meterReadings, label: "Meter Readings", icon: "◔" },
    { href: ROUTES.invoices, label: "My Invoices", icon: "€" },
    { href: ROUTES.documents, label: "Documents", icon: "▤" },
    { href: ROUTES.notifications, label: "Notifications", icon: "◉" },
    { href: ROUTES.settings, label: "Settings", icon: "⚙" },
  ],
  landlord: [
    { href: ROUTES.dashboard, label: "Dashboard", icon: "⌂" },
    { href: ROUTES.apartments, label: "My Apartments", icon: "▥" },
    { href: ROUTES.residents, label: "Tenants", icon: "◌" },
    { href: ROUTES.invoices, label: "Invoices", icon: "€" },
    { href: ROUTES.meterReadings, label: "Meter Readings", icon: "◔" },
    { href: ROUTES.documents, label: "Documents", icon: "▤" },
    { href: ROUTES.notifications, label: "Notifications", icon: "◉" },
    { href: ROUTES.settings, label: "Settings", icon: "⚙" },
  ],
};

function readCookie(name: string): string {
  if (typeof document === "undefined") return "";
  return decodeURIComponent(document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))?.[1] ?? "");
}

export function RoleAwareSidebar({ brand, title, description, defaultRole, children }: RoleAwareSidebarProps) {
  const t = useTranslations("appShell.header");
  const rawPathname = usePathname();
  const pathname = rawPathname ?? ROUTES.dashboard;
  const role = normalizeDashboardRole(defaultRole);
  const navItems = navByRole[role];
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const notifications = useAppNotifications({ previewLimit: 5 });

  const userEmail = useMemo(() => readCookie("userEmail") || "user@domera.lv", []);
  const roleLabel = t(`roles.${role}`);
  const pageTitle = useMemo(() => {
    const routeTitleMap: Array<{ href: string; key: string; exact?: boolean }> = [
      { href: ROUTES.dashboard, key: "dashboard", exact: true },
      { href: ROUTES.buildings, key: "buildings" },
      { href: ROUTES.apartments, key: "apartments" },
      { href: ROUTES.residents, key: "residents" },
      { href: ROUTES.invoices, key: "invoices" },
      { href: ROUTES.meterReadings, key: "meterReadings" },
      { href: ROUTES.debts, key: "debts" },
      { href: ROUTES.documents, key: "documents" },
      { href: ROUTES.notifications, key: "notificationsPage" },
      { href: ROUTES.settings, key: "settings" },
    ];

    const matchedRoute = routeTitleMap.find(({ href, exact }) =>
      exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`),
    );

    return matchedRoute ? t(`pageTitles.${matchedRoute.key}`) : title;
  }, [pathname, t, title]);

  function isActive(href: string) {
    if (href === ROUTES.dashboard) {
      return pathname === href;
    }

    return pathname.startsWith(href);
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex min-h-screen flex-col lg:flex-row">

        {/* Mobile backdrop */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/40 lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={`
            fixed top-0 left-0 z-40 h-full w-72 bg-white border-r border-slate-200 flex flex-col
            transition-transform duration-300 ease-in-out
            ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}
            lg:static lg:translate-x-0 lg:min-h-screen lg:w-72
          `}
        >
          {/* Sidebar header */}
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-100 px-5">
            <p className="text-xl font-bold tracking-tight text-orange-500">{brand}</p>
            <div className="flex items-center gap-2">
              {/* Locale switcher — mobile only */}
              <div className="lg:hidden">
                <LocaleSwitcher />
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 lg:hidden"
                aria-label="Close menu"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Nav */}
          <div className="flex-1 overflow-y-auto px-3 py-4">
            <nav className="space-y-0.5">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive(item.href)
                      ? "bg-orange-500 text-white"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <span className="w-4 text-center text-base leading-none opacity-80">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>
          </div>

          {/* Sidebar footer */}
          <div className="shrink-0 border-t border-slate-100 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{roleLabel}</p>
            <p className="mt-0.5 truncate text-xs text-slate-500">{userEmail}</p>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white px-4 py-0 lg:px-6">
            {/* Single-row header */}
            <div className="flex h-14 items-center gap-3">
              {/* Hamburger — mobile only */}
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 lg:hidden"
                aria-label="Open menu"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>

              {/* Title */}
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-base font-semibold text-slate-900 lg:text-xl">{pageTitle}</h1>
                <p className="hidden text-xs text-slate-500 lg:block">{t("currentWorkspace", { role: roleLabel })}</p>
              </div>

              {/* Actions */}
              <div className="flex shrink-0 items-center gap-2">
                {/* Locale — desktop only */}
                <div className="hidden lg:block">
                  <LocaleSwitcher />
                </div>

                {/* Notifications */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      notifications.toggle();
                      setProfileOpen(false);
                    }}
                    className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                    aria-label={t("notifications.openAria")}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5">
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>
                    {notifications.count > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-orange-500 px-1 text-[9px] font-bold text-white">
                        {notifications.count}
                      </span>
                    )}
                  </button>

                  {notifications.isOpen && (
                    <div className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-900">{t("notifications.title")}</p>
                        <button
                          type="button"
                          onClick={() => void notifications.refresh()}
                          className="text-xs font-medium text-slate-400 transition hover:text-slate-900"
                        >
                          {t("notifications.refresh")}
                        </button>
                      </div>

                      {notifications.isLoading ? (
                        <div className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-500">{t("notifications.loading")}</div>
                      ) : notifications.error ? (
                        <div className="rounded-lg bg-red-50 px-3 py-3 text-sm text-red-600">{notifications.error}</div>
                      ) : notifications.hasItems ? (
                        <div className="space-y-2">
                          {notifications.previewItems.map((item) => (
                            <div key={item.id} className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-700">
                              <div className="flex items-start justify-between gap-3">
                                <p className="font-medium text-slate-900">{item.title}</p>
                                <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                  {item.channel}
                                </span>
                              </div>
                              <p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-500">{t("notifications.empty")}</div>
                      )}

                      <Link
                        href={ROUTES.notifications}
                        onClick={() => notifications.close()}
                        className="mt-3 inline-flex w-full items-center justify-center rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        {t("notifications.viewAll")}
                      </Link>
                    </div>
                  )}
                </div>

                {/* Profile */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen((value) => !value);
                      notifications.close();
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-white hover:bg-slate-700"
                    aria-label={t("profile.openAria")}
                  >
                    {userEmail.slice(0, 1).toUpperCase()}
                  </button>

                  {profileOpen && (
                    <div className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{t("profile.title")}</p>
                      <p className="mt-1.5 break-all text-sm font-medium text-slate-900">{userEmail}</p>
                      <div className="mt-3 flex flex-col gap-1.5">
                        <Link
                          href={ROUTES.settings}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
                        >
                          {t("profile.settings")}
                        </Link>
                        <LogoutButton />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </header>

          <main className="p-4 lg:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
