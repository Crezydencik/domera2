/**
 * Central route map for the Domera frontend.
 * Use these constants everywhere instead of hardcoding path strings.
 */
export const ROUTES = {
  // ── Public ──────────────────────────────────────────────
  landing: "/",

  // ── Auth ────────────────────────────────────────────────
  login: "/login",
  logout: "/logout",
  register: "/register",
  registerVerify: "/register/verify",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  acceptInvitation: "/accept-invitation",
  privacyPolicy: "/privacy-policy",
  termsOfUse: "/terms-of-use",

  // ── App (requires authentication) ───────────────────────
  dashboard: "/dashboard",
  platformUsers: "/platform-users",
  approvals: "/approvals",
  adminBuildings: "/admin-buildings",
  platformBilling: "/platform-billing",
  buildings: "/buildings",
  apartments: "/apartments",
  residents: "/residents",
  invoices: "/invoices",
  electricity: "/electricity",
  meterReadings: "/meter-readings",
  meterReadingsBuilding: "/meter-readings/building",
  debts: "/debts",
  documents: "/documents",
  notifications: "/notifications",
  support: "/support",
  settings: "/settings",
} as const;

export type AppRoute = (typeof ROUTES)[keyof typeof ROUTES];
