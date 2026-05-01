import { ROUTES } from "@/shared/lib/routes";
import { type DashboardRole, normalizeDashboardRole } from "@/shared/role-ui";

export const roleCookieValues: Record<DashboardRole, string> = {
  managementCompany: "ManagementCompany",
  resident: "Resident",
  landlord: "Landlord",
};

export const authRoutes = new Set<string>([
  ROUTES.login,
  ROUTES.register,
  ROUTES.forgotPassword,
  ROUTES.resetPassword,
  ROUTES.acceptInvitation,
]);

export const allowedRoutesByRole: Record<DashboardRole, string[]> = {
  managementCompany: [
    ROUTES.dashboard,
    ROUTES.buildings,
    ROUTES.apartments,
    ROUTES.residents,
    ROUTES.invoices,
    ROUTES.meterReadings,
    ROUTES.debts,
    ROUTES.documents,
    ROUTES.notifications,
    ROUTES.settings,
  ],
  resident: [
    ROUTES.dashboard,
    ROUTES.apartments,
    ROUTES.invoices,
    ROUTES.meterReadings,
    ROUTES.documents,
    ROUTES.notifications,
    ROUTES.settings,
  ],
  landlord: [
    ROUTES.dashboard,
    ROUTES.apartments,
    ROUTES.residents,
    ROUTES.invoices,
    ROUTES.meterReadings,
    ROUTES.documents,
    ROUTES.notifications,
    ROUTES.settings,
  ],
};

export function resolveDashboardRole(value?: string | null) {
  return normalizeDashboardRole(value);
}

export function isAuthRoute(pathname: string) {
  return authRoutes.has(pathname);
}

export function matchesPath(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function isProtectedPath(pathname: string) {
  return Object.values(allowedRoutesByRole).some((routes) => routes.some((route) => matchesPath(pathname, route)));
}

export function isAllowedPath(pathname: string, role: DashboardRole) {
  return allowedRoutesByRole[role].some((route) => matchesPath(pathname, route));
}
