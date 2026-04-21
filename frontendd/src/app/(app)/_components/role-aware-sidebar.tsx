"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { LogoutButton } from "@/components/logout-button";
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

const roleLabels: Record<DashboardRole, string> = {
  managementCompany: "Management company",
  resident: "Resident",
  landlord: "Landlord",
};

const notificationItems = [
  "New invoice generated",
  "Meter reading reminder",
  "Building update from manager",
];

function readCookie(name: string): string {
  if (typeof document === "undefined") return "";
  return decodeURIComponent(document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))?.[1] ?? "");
}

export function RoleAwareSidebar({ brand, title, description, defaultRole, children }: RoleAwareSidebarProps) {
  const rawPathname = usePathname();
  const pathname = rawPathname ?? ROUTES.dashboard;
  const role = normalizeDashboardRole(defaultRole);
  const navItems = navByRole[role];
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const userEmail = useMemo(() => readCookie("userEmail") || "user@domera.lv", []);

  function isActive(href: string) {
    if (href === ROUTES.dashboard) {
      return pathname === href;
    }

    return pathname.startsWith(href);
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <aside className="w-full border-b border-slate-200 bg-white lg:min-h-screen lg:w-72 lg:border-b-0 lg:border-r">
          <div className="p-4 lg:p-5">
            <div className="mb-6">
              <p className="text-2xl font-semibold text-orange-500">{brand}</p>
              <p className="mt-2 text-sm text-slate-500">{description}</p>
            </div>

            <nav className="space-y-1.5">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                    isActive(item.href)
                      ? "bg-orange-500 text-white shadow-sm"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span className="text-base leading-none">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>

          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:px-6">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
                <p className="text-sm text-slate-500">Current workspace: {roleLabels[role]}</p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <LocaleSwitcher />
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setNotificationsOpen((value) => !value);
                      setProfileOpen(false);
                    }}
                    className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600"
                    aria-label="Notifications"
                  >
                    🔔
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-white">
                      {notificationItems.length}
                    </span>
                  </button>

                  {notificationsOpen && (
                    <div className="absolute right-0 z-20 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
                      <p className="mb-2 text-sm font-semibold text-slate-900">Notifications</p>
                      <div className="space-y-2">
                        {notificationItems.map((item) => (
                          <div key={item} className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen((value) => !value);
                      setNotificationsOpen(false);
                    }}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-700"
                    aria-label="Profile menu"
                  >
                    {userEmail.slice(0, 1).toUpperCase()}
                  </button>

                  {profileOpen && (
                    <div className="absolute right-0 z-20 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Profile</p>
                      <p className="mt-2 break-all text-sm font-medium text-slate-900">{userEmail}</p>

                      <div className="mt-3 flex flex-col gap-2">
                        <Link
                          href={ROUTES.settings}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
                        >
                          Settings
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
