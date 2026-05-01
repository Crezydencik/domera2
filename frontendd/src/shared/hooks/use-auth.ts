"use client";

import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { isAllowedPath, isProtectedPath, resolveDashboardRole } from "@/shared/api/access";
import type { DashboardRole } from "@/shared/role-ui";
import {
  type BrowserAuthSession,
  readBrowserAuthSession,
  subscribeToAuthSession,
} from "@/shared/lib/auth-session";

export type AuthSessionState = BrowserAuthSession & {
  dashboardRole: DashboardRole;
};

const serverSnapshot: AuthSessionState = {
  isAuthenticated: false,
  role: "managementCompany",
  dashboardRole: resolveDashboardRole("managementCompany"),
};

let cachedClientSnapshot: AuthSessionState = serverSnapshot;

function isSameSnapshot(a: AuthSessionState, b: AuthSessionState) {
  return (
    a.isAuthenticated === b.isAuthenticated &&
    a.userId === b.userId &&
    a.email === b.email &&
    a.accountType === b.accountType &&
    a.role === b.role &&
    a.companyId === b.companyId &&
    a.apartmentId === b.apartmentId &&
    a.dashboardRole === b.dashboardRole
  );
}

function getSnapshot(): AuthSessionState {
  const session = readBrowserAuthSession();

  const nextSnapshot: AuthSessionState = {
    ...session,
    dashboardRole: resolveDashboardRole(session.role),
  };

  if (isSameSnapshot(cachedClientSnapshot, nextSnapshot)) {
    return cachedClientSnapshot;
  }

  cachedClientSnapshot = nextSnapshot;
  return cachedClientSnapshot;
}

function getServerSnapshot(): AuthSessionState {
  return serverSnapshot;
}

export function useAuthSession(): AuthSessionState {
  return useSyncExternalStore(subscribeToAuthSession, getSnapshot, getServerSnapshot);
}

export function useDashboardRole() {
  return useAuthSession().dashboardRole;
}

export function useIsAuthenticated() {
  return useAuthSession().isAuthenticated;
}

export function useHasRole(allowedRoles: DashboardRole | DashboardRole[]) {
  const { dashboardRole } = useAuthSession();
  const roleList = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return roleList.includes(dashboardRole);
}

export function useRoleAccess(pathname?: string) {
  const currentPathname = usePathname();
  const session = useAuthSession();
  const targetPath = pathname ?? currentPathname ?? "/";
  const protectedPath = isProtectedPath(targetPath);

  return {
    ...session,
    pathname: targetPath,
    isProtectedPath: protectedPath,
    isAllowed: !protectedPath || isAllowedPath(targetPath, session.dashboardRole),
  };
}
