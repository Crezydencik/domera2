"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FiAlertCircle, FiArrowRight, FiBell, FiCheckCircle, FiChevronDown, FiLogOut, FiMenu, FiSettings, FiUser, FiX } from "react-icons/fi";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { apiFetch } from "@/shared/api/client";
import { establishUserSession } from "@/shared/lib/auth-client";
import { clearBrowserAuthCookies } from "@/shared/lib/auth-session";
import { getPlatformUsers, type PlatformUser } from "@/shared/api/users";
import { useAuthSession } from "@/shared/hooks/use-auth";
import { useAppNotifications } from "@/shared/hooks/use-app-notifications";
import { useNotifications as useToastNotifications } from "@/shared/hooks/use-notifications";
import { BUILDING_CREATION_REQUESTS_CHANGED_EVENT } from "@/shared/lib/building-creation-requests-events";
import { ROUTES } from "@/shared/lib/routes";
import { type DashboardRole, normalizeDashboardRole } from "@/shared/role-ui";
import type { NotificationItem } from "@/shared/lib/data";

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
  showIndicator?: boolean;
};

type UserProfileSummary = {
  email?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  name?: string;
  displayName?: string;
  username?: string;
  userName?: string;
  hasOwnership?: boolean;
  hasTenancy?: boolean;
  propertyRoles?: string[];
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";

function resolveUserName(email: string): string {
  const namePart = email.split("@")[0]?.trim();
  if (!namePart) return "Domera user";

  return namePart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
  }

function firstText(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function resolveProfileName(profile: UserProfileSummary | null, sessionName: string | undefined, fallbackEmail: string): string {
  const joinedName = [profile?.firstName, profile?.lastName]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim())
    .join(" ");
  const fallbackName = resolveUserName(fallbackEmail);

  return firstText(
    joinedName,
    profile?.fullName,
    profile?.name,
    profile?.displayName,
    sessionName,
    fallbackName,
    profile?.username,
    profile?.userName,
  ) ?? fallbackName;
}

function hasPendingBuildingCreationRequests(users: PlatformUser[]) {
  return users.some((user) => {
    if (user.buildingCreationRequestStatus?.trim().toLowerCase() === "pending") {
      return true;
    }

    return (user.buildingCreationRequests ?? []).some((request) => {
      const status = request.status?.trim().toLowerCase();
      return !status || status === "pending";
    });
  });
}
  
  export function RoleAwareSidebar({ brand, title, defaultRole, children }: RoleAwareSidebarProps) {
    const tm = useTranslations("appShell.header.pageTitles");
  const navByRole: Record<DashboardRole, NavItem[]> = {
    platformAdmin: [
      { href: ROUTES.dashboard, label: tm("dashboard"), icon: "A" },
      { href: ROUTES.platformUsers, label: "Platform users", icon: "U" },
      { href: ROUTES.approvals, label: "Approvals", icon: "✓" },
      { href: ROUTES.adminBuildings, label: "Buildings", icon: "B" },
      { href: ROUTES.platformBilling, label: "Invoices / Documents", icon: "I" },
      { href: ROUTES.settings, label: tm("settings"), icon: "S" },
    ],
    
    managementCompany: [
      { href: ROUTES.dashboard, label: tm("dashboard"), icon: "⌂" },
      { href: ROUTES.buildings, label: tm("buildings"), icon: "▣" },
      { href: ROUTES.apartments, label: tm("apartments"), icon: "▥" },
      { href: ROUTES.residents, label: tm("residents"), icon: "◌" },
      { href: ROUTES.meterReadings, label: tm("meterReadings"), icon: "◔" },
      { href: ROUTES.invoices, label: tm("invoices"), icon: "€" },
      // { href: ROUTES.debts, label: "Debts", icon: "!" },
      { href: ROUTES.documents, label: tm("documents"), icon: "▤" },
      // { href: ROUTES.notifications, label: tm("notifications"), icon: "◉" },
      { href: ROUTES.settings, label: tm("settings"), icon: "⚙" },
    ],
    resident: [
      { href: ROUTES.dashboard, label: tm("dashboard"), icon: "⌂" },
      { href: ROUTES.apartments, label: tm("apartments"), icon: "▥" },
      { href: ROUTES.meterReadings, label: tm("meterReadings"), icon: "◔" },
      { href: ROUTES.invoices, label: tm("invoices"), icon: "€" },
      { href: ROUTES.documents, label: tm("documents"), icon: "▤" },
      // { href: ROUTES.notifications, label: tm("notifications"), icon: "◉" },
      { href: ROUTES.settings, label: tm("settings"), icon: "⚙" },
    ],
    landlord: [
      { href: ROUTES.dashboard, label: tm("dashboard"), icon: "⌂" },
      { href: ROUTES.apartments, label: tm("apartments"), icon: "▥" },
      { href: ROUTES.invoices, label: tm("invoices"), icon: "€" },
      { href: ROUTES.meterReadings, label: tm("meterReadings"), icon: "◔" },
      { href: ROUTES.documents, label: tm("documents"), icon: "▤" },
      { href: ROUTES.settings, label: tm("settings"), icon: "⚙" },
    ] }
  const t = useTranslations("appShell.header");
  const router = useRouter();
  const rawPathname = usePathname();
  const pathname = rawPathname ?? ROUTES.dashboard;
  const role = normalizeDashboardRole(defaultRole);
  const [hasPendingBuildingRequests, setHasPendingBuildingRequests] = useState(false);
  const navItems = role === "platformAdmin"
    ? navByRole[role]
        .filter((item) => item.href !== ROUTES.approvals)
        .map((item) =>
          item.href === ROUTES.adminBuildings
            ? { ...item, showIndicator: hasPendingBuildingRequests }
            : item,
        )
    : navByRole[role];
  const [profileOpen, setProfileOpen] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [acceptingNotificationId, setAcceptingNotificationId] = useState<string | null>(null);
  const notifications = useAppNotifications({ previewLimit: 5 });
  const notificationsOpen = notifications.isOpen;
  const closeNotifications = notifications.close;
  const notificationsRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const confirm = useConfirm();
  const toast = useToastNotifications();
  const session = useAuthSession();
  const [profileSummary, setProfileSummary] = useState<UserProfileSummary | null>(null);

 const userEmail = session.email ?? "user@domera.lv";
const userName = resolveProfileName(profileSummary, session.name, userEmail);
  const userInitial = userName.slice(0, 1).toUpperCase();
  const roleLabel = role === "platformAdmin" ? "Platform administrator" : t(`roles.${role}`);
  const propertyRoleLabel = useMemo(() => {
    const roles = new Set(
      (profileSummary?.propertyRoles ?? [])
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim().toLowerCase()),
    );

    if (profileSummary?.hasOwnership) roles.add("owner");
    if (profileSummary?.hasTenancy) roles.add("tenant");

    const labels = [
      roles.has("owner") ? t("profile.propertyRoles.owner") : "",
      roles.has("tenant") ? t("profile.propertyRoles.tenant") : "",
    ].filter(Boolean);

    if (!labels.length && role === "managementCompany") {
      return roleLabel;
    }

    return labels.join(" / ");
  }, [profileSummary, role, roleLabel, t]);
  const pageTitle = useMemo(() => {
    const routeTitleMap: Array<{ href: string; key: string; exact?: boolean }> = [
      { href: ROUTES.dashboard, key: "dashboard", exact: true },
      { href: ROUTES.platformUsers, key: "platformUsers" },
      { href: ROUTES.approvals, key: "approvals" },
      { href: ROUTES.adminBuildings, key: "adminBuildings" },
      { href: ROUTES.platformBilling, key: "platformBilling" },
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

    if (matchedRoute?.key === "platformUsers") {
      return "Platform users";
    }

    if (matchedRoute?.key === "approvals") {
      return "Approvals";
    }

    if (matchedRoute?.key === "adminBuildings") {
      return "Buildings";
    }

    if (matchedRoute?.key === "platformBilling") {
      return "Invoices / Documents";
    }

    return matchedRoute ? t(`pageTitles.${matchedRoute.key}`) : title;
  }, [pathname, t, title]);

  function isActive(href: string) {
    if (href === ROUTES.dashboard) {
      return pathname === href;
    }

    return pathname.startsWith(href);
  }

  function getInvitationToken(actionHref?: string) {
    if (!actionHref) return "";

    try {
      const url = new URL(actionHref, window.location.origin);
      return url.searchParams.get("token") ?? "";
    } catch {
      return "";
    }
  }

  function getNotificationDisplay(item: NotificationItem) {
    const isBuildingCreationRequest =
      item.type === "building-creation-request" || item.title.trim().toLowerCase() === "building creation request";

    if (isBuildingCreationRequest) {
      const buildingLabel = [item.buildingName, item.buildingAddress].filter(Boolean).join(", ");
      const companyLabel = item.companyName || item.requesterEmail || "";
      const fallbackDescription = item.description === "Admin requested access to add buildings."
        ? "Open building approvals to review pending requests."
        : item.description;

      return {
        title: item.title,
        description: companyLabel
          ? buildingLabel
            ? `${companyLabel} requested approval to create ${buildingLabel}.`
            : `${companyLabel} requested access to add buildings.`
          : fallbackDescription,
        channel: item.channel,
        actionLabel: item.actionLabel || "Review request",
      };
    }

    if (item.type !== "owner-invitation" && item.type !== "tenant-invitation") {
      return {
        title: item.title,
        description: item.description,
        channel: item.channel,
        actionLabel: item.actionLabel,
      };
    }

    return {
      title: t("notifications.ownerInvitationTitle"),
      description: t("notifications.ownerInvitationDescription", {
        apartment: item.apartmentNumber || "—",
        building: item.buildingName || "—",
      }),
      channel: t("notifications.invitationChannel"),
      actionLabel: t("notifications.acceptInvitation"),
    };
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        notificationsOpen &&
        notificationsRef.current &&
        !notificationsRef.current.contains(event.target as Node)
      ) {
        closeNotifications();
      }

      if (
        profileOpen &&
        profileRef.current &&
        !profileRef.current.contains(event.target as Node)
      ) {
        setProfileOpen(false);
      }
    }

    if (notificationsOpen || profileOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [closeNotifications, notificationsOpen, profileOpen]);

  useEffect(() => {
    if (!session.isAuthenticated) {
      setProfileSummary(null);
      return;
    }

    let active = true;

    apiFetch<UserProfileSummary | null>("/users/me")
      .then((profile) => {
        if (active) setProfileSummary(profile);
      })
      .catch(() => {
        if (active) setProfileSummary(null);
      });

    return () => {
      active = false;
    };
  }, [session.isAuthenticated, session.userId]);

  useEffect(() => {
    if (role !== "platformAdmin" || !session.isAuthenticated) {
      setHasPendingBuildingRequests(false);
      return;
    }

    let active = true;

    const refreshPendingBuildingRequests = () => {
      getPlatformUsers()
        .then((response) => {
          if (active) setHasPendingBuildingRequests(hasPendingBuildingCreationRequests(response.items ?? []));
        })
        .catch(() => {
          if (active) setHasPendingBuildingRequests(false);
        });
    };

    refreshPendingBuildingRequests();

    const handleFocus = () => refreshPendingBuildingRequests();
    window.addEventListener("focus", handleFocus);
    window.addEventListener(BUILDING_CREATION_REQUESTS_CHANGED_EVENT, refreshPendingBuildingRequests);

    return () => {
      active = false;
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener(BUILDING_CREATION_REQUESTS_CHANGED_EVENT, refreshPendingBuildingRequests);
    };
  }, [role, session.isAuthenticated]);

  async function handleLogout() {
    setLogoutLoading(true);

    try {
      await fetch(`${apiBaseUrl}/auth/clear-cookies`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Local cleanup is still enough to leave the app shell.
    } finally {
      clearBrowserAuthCookies();
      setProfileOpen(false);
      router.push(`${ROUTES.login}?expired=1`);
      router.refresh();
      setLogoutLoading(false);
    }
  }

  function getNotificationTone(item: NotificationItem) {
    if (item.type === "owner-invitation" || item.type === "tenant-invitation") {
      return {
        icon: FiCheckCircle,
        container: "bg-emerald-50 text-emerald-950",
        iconBox: "bg-emerald-100 text-emerald-600",
        action: "text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700",
      };
    }

    return {
      icon: FiAlertCircle,
      container: "bg-blue-50 text-blue-950",
      iconBox: "bg-blue-100 text-blue-600",
      action: "text-blue-600 hover:bg-blue-100 hover:text-blue-700",
    };
  }

  async function handleNotificationAction(item: NotificationItem) {
    const isBuildingCreationRequest =
      item.type === "building-creation-request" || item.title.trim().toLowerCase() === "building creation request";
    const actionHref = isBuildingCreationRequest ? ROUTES.adminBuildings : item.actionHref;
    const token = getInvitationToken(actionHref);

    if (!token) {
      if (actionHref) {
        await notifications.dismiss(item.id);
        router.push(actionHref);
      }
      notifications.close();
      return;
    }

    const accepted = await confirm({
      title: t("notifications.acceptInvitationConfirmTitle"),
      message: t("notifications.acceptInvitationConfirmMessage"),
      confirmLabel: t("notifications.acceptInvitationConfirm"),
      cancelLabel: t("notifications.acceptInvitationCancel"),
      variant: "primary",
    });

    if (!accepted) return;

    setAcceptingNotificationId(item.id);
    try {
      await apiFetch("/invitations/accept", {
        method: "POST",
        body: JSON.stringify({
          token,
          gdprConsent: true,
        }),
      });

      await notifications.dismiss(item.id);

      if (session.userId && session.email) {
        await establishUserSession({
          userId: session.userId,
          email: session.email,
          accountType: item.type === "tenant-invitation" ? "Resident" : "Landlord",
        }).catch(() => null);
      }

      toast.success(t("notifications.acceptInvitationSuccess"));
      notifications.close();
      router.push(ROUTES.dashboard);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось принять приглашение");
    } finally {
      setAcceptingNotificationId(null);
    }
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
            fixed top-0 left-0 z-40 h-dvh w-72 overflow-hidden bg-white border-r border-slate-200 flex flex-col
            transition-transform duration-300 ease-in-out
            ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}
            lg:translate-x-0
          `}
        >
          {/* Sidebar header */}
          <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 sm:px-5">
            <img
              src="https://firebasestorage.googleapis.com/v0/b/domera-eb224.firebasestorage.app/o/System%2FDomera_loga.png?alt=media&token=53ccefaa-c38f-490b-9138-010da531327e"
              alt="Domera Logo"
              className="h-7 min-w-0 max-w-[calc(100%_-_4.5rem)] object-contain sm:h-8 sm:max-w-[11rem]"
            />
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
                <FiX className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Nav */}
          <div className="min-h-0 flex-1 overflow-hidden px-3 py-4">
            <nav className="space-y-0.5">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive(item.href)
                      ? "bg-sky-600 text-white"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="w-4 shrink-0 text-center text-base leading-none opacity-80">{item.icon}</span>
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.showIndicator ? (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full bg-red-500 ring-2 ring-white"
                      aria-label="Pending building request"
                    />
                  ) : null}
                </Link>
              ))}
            </nav>
          </div>
        </aside>

        <div className="min-w-0 flex-1 lg:ml-72">
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
                <FiMenu className="h-5 w-5" aria-hidden="true" />
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
                <div className="relative" ref={notificationsRef}>
                  <button
                    type="button"
                    onClick={() => {
                      notifications.toggle();
                      setProfileOpen(false);
                    }}
                    className="relative flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-950 shadow-sm transition hover:border-slate-300 hover:bg-white"
                    aria-label={t("notifications.openAria")}
                  >
                    <FiBell className="h-5 w-5" aria-hidden="true" />
                    {notifications.count > 0 && (
                      <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-slate-50" />
                    )}
                  </button>

                  {notifications.isOpen && (
                    <div className="fixed inset-x-4 top-16 z-20 w-auto max-w-none overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/12 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-3 sm:w-96 sm:max-w-[calc(100vw-2rem)]">
                      <div className="border-b border-slate-100 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-bold leading-5 text-slate-950">{t("notifications.title")}</p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2 p-3">
                        {notifications.isLoading ? (
                          <div className="rounded-lg bg-slate-100 px-3 py-3 text-sm text-slate-500">{t("notifications.loading")}</div>
                        ) : notifications.error ? (
                          <div className="rounded-lg bg-red-50 px-3 py-3 text-sm text-red-600">{notifications.error}</div>
                        ) : notifications.hasItems ? (
                          <>
                          {notifications.previewItems.map((item) => {
                            const display = getNotificationDisplay(item);
                            const tone = getNotificationTone(item);
                            const ToneIcon = tone.icon;

                            return (
                            <div key={item.id} className={`flex items-start gap-3 rounded-lg px-3 py-3 ${tone.container}`}>
                              <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone.iconBox}`}>
                                <ToneIcon className="h-4 w-4" aria-hidden="true" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-bold leading-5">{display.title}</p>
                                    <p className="line-clamp-2 text-xs leading-4 text-slate-600">{display.description}</p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => void notifications.dismiss(item.id)}
                                    className="shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-white/60 hover:text-slate-700"
                                    aria-label={t("notifications.dismissAria")}
                                  >
                                    <FiX className="h-4 w-4" aria-hidden="true" />
                                  </button>
                                </div>
                                <div className="mt-1.5 flex items-center">
                                  {item.actionHref && display.actionLabel ? (
                                    <button
                                      type="button"
                                      onClick={() => void handleNotificationAction(item)}
                                      disabled={acceptingNotificationId === item.id}
                                      className={`inline-flex h-6 w-6 items-center justify-center rounded-md transition disabled:pointer-events-none disabled:opacity-60 ${tone.action}`}
                                      aria-label={display.actionLabel}
                                      title={display.actionLabel}
                                    >
                                      <FiArrowRight className="h-4 w-4" aria-hidden="true" />
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                            );
                          })}
                          </>
                        ) : (
                          <div className="rounded-lg bg-slate-100 px-3 py-3 text-sm text-slate-500">{t("notifications.empty")}</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Profile */}
                <div className="relative" ref={profileRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen((value) => !value);
                      notifications.close();
                    }}
                    className="flex h-10 min-w-10 items-center gap-2 rounded-full border border-slate-200 bg-white p-1 pr-2 text-left shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                    aria-label={t("profile.openAria")}
                    aria-expanded={profileOpen}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-600 text-sm font-bold text-white">
                      {userInitial}
                    </span>
                    <span className="hidden min-w-0 max-w-36 sm:block lg:max-w-44">
                      <span className="block truncate text-sm font-semibold leading-4 text-slate-950">{userName}</span>
                      {propertyRoleLabel ? (
                        <span className="block truncate text-[11px] leading-4 text-slate-500">{propertyRoleLabel}</span>
                      ) : null}
                    </span>
                    <FiChevronDown
                      className={`hidden h-4 w-4 shrink-0 text-slate-500 transition sm:block ${profileOpen ? "rotate-180" : ""}`}
                      aria-hidden="true"
                    />
                  </button>

                  {profileOpen && (
                    <div className="absolute right-0 z-20 mt-2 w-72 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl shadow-slate-900/10">
                      <div className="flex items-center gap-3 px-4 py-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-600 text-base font-bold text-white">
                          {userInitial}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-950">{userName}</p>
                          <p className="truncate text-sm text-slate-500">{userEmail}</p>
                        </div>
                      </div>

                      <div className="border-t border-slate-100 py-2">
                        <Link
                          href={ROUTES.settings}
                          onClick={() => setProfileOpen(false)}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
                        >
                          <FiUser className="h-4 w-4 shrink-0" aria-hidden="true" />
                          <span>{t("profile.viewProfile")}</span>
                        </Link>
                        <Link
                          href={ROUTES.settings}
                          onClick={() => setProfileOpen(false)}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
                        >
                          <FiSettings className="h-4 w-4 shrink-0" aria-hidden="true" />
                          <span>{t("profile.accountSettings")}</span>
                        </Link>
                      </div>

                      <div className="border-t border-slate-100 py-2">
                        <button
                          type="button"
                          onClick={() => void handleLogout()}
                          disabled={logoutLoading}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-950 disabled:pointer-events-none disabled:opacity-60"
                        >
                          <FiLogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
                          <span>{logoutLoading ? t("profile.signingOut") : t("profile.signOut")}</span>
                        </button>
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
