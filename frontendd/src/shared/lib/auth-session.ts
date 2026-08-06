const AUTH_SESSION_EVENT = "domera:auth-session-changed";

export type BrowserAuthSession = {
  isAuthenticated: boolean;
  userId?: string;
  email?: string;
  name?: string;
  accountType?: string;
  role: string;
  companyId?: string;
  apartmentId?: string;
};

const legacyAuthCookieNames = [
  "domera_session",
  "domera_role",
  "domera_accountType",
  "domera_companyId",
  "domera_apartmentId",
  "userId",
  "userEmail",
  "userName",
  "domera_logged_out",
] as const;

const authCookieNamesToClear = ["__session", ...legacyAuthCookieNames] as const;

const STANDARD_SESSION_MAX_AGE_SECONDS = 30 * 60;
const REMEMBER_ME_MAX_AGE_SECONDS = 14 * 24 * 60 * 60;

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;

  const prefix = `${name}=`;
  const entry = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix));

  if (!entry) return undefined;

  try {
    return decodeURIComponent(entry.slice(prefix.length));
  } catch {
    return entry.slice(prefix.length);
  }
}

function writeCookie(name: string, value: string | undefined, maxAgeSeconds: number) {
  if (typeof document === "undefined") return;

  if (!value?.trim()) {
    document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
    return;
  }

  document.cookie = `${name}=${encodeURIComponent(value.trim())}; Max-Age=${maxAgeSeconds}; path=/; SameSite=Lax`;
}

export function persistBrowserAuthSessionHints(params: {
  userId?: string;
  email?: string;
  name?: string;
  role?: string;
  accountType?: string;
  companyId?: string;
  apartmentId?: string;
  rememberMe?: boolean;
}) {
  const maxAgeSeconds = params.rememberMe ? REMEMBER_ME_MAX_AGE_SECONDS : STANDARD_SESSION_MAX_AGE_SECONDS;

  if ("userId" in params) writeCookie("userId", params.userId, maxAgeSeconds);
  if ("email" in params) writeCookie("userEmail", params.email, maxAgeSeconds);
  if ("name" in params) writeCookie("userName", params.name, maxAgeSeconds);
  if ("role" in params) writeCookie("domera_role", params.role, maxAgeSeconds);
  if ("accountType" in params) writeCookie("domera_accountType", params.accountType, maxAgeSeconds);
  if ("companyId" in params) writeCookie("domera_companyId", params.companyId, maxAgeSeconds);
  if ("apartmentId" in params) writeCookie("domera_apartmentId", params.apartmentId, maxAgeSeconds);
  notifyAuthSessionChanged();
}

export function readBrowserAuthSession(): BrowserAuthSession {
  const userId = readCookie("userId");
  const email = readCookie("userEmail");
  const name = readCookie("userName");
  const role = readCookie("domera_role") ?? readCookie("domera_accountType") ?? "managementCompany";

  return {
    isAuthenticated: Boolean(userId || email || readCookie("domera_role")),
    userId,
    email,
    name,
    accountType: readCookie("domera_accountType"),
    role,
    companyId: readCookie("domera_companyId"),
    apartmentId: readCookie("domera_apartmentId"),
  };
}

export function notifyAuthSessionChanged() {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new Event(AUTH_SESSION_EVENT));
}

export function clearBrowserAuthCookies() {
  if (typeof document === "undefined") return;

  for (const name of authCookieNamesToClear) {
    document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
  }

  notifyAuthSessionChanged();
}

export function subscribeToAuthSession(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleChange = () => onStoreChange();

  window.addEventListener(AUTH_SESSION_EVENT, handleChange);
  window.addEventListener("focus", handleChange);
  document.addEventListener("visibilitychange", handleChange);

  return () => {
    window.removeEventListener(AUTH_SESSION_EVENT, handleChange);
    window.removeEventListener("focus", handleChange);
    document.removeEventListener("visibilitychange", handleChange);
  };
}
