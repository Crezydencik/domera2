/**
 * Central route map for the Domera frontend.
 * Use these constants everywhere instead of hardcoding path strings.
 */
export const ROUTES = {
  // ── Public ──────────────────────────────────────────────
  landing: "/",

  // ── Auth ────────────────────────────────────────────────
  login: "/login",
  register: "/register",
  registerVerify: "/register/verify",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  acceptInvitation: "/accept-invitation",
  privacyPolicy: "/privacy-policy",
  termsOfUse: "/terms-of-use",

  // ── App (requires authentication) ───────────────────────
  dashboard: "/dashboard",
  buildings: "/buildings",
  apartments: "/apartments",
  residents: "/residents",
  invoices: "/invoices",
  meterReadings: "/meter-readings",
  debts: "/debts",
  documents: "/documents",
  notifications: "/notifications",
  settings: "/settings",
} as const;

export type AppRoute = (typeof ROUTES)[keyof typeof ROUTES];
