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

export function readBrowserAuthSession(): BrowserAuthSession {
  return {
    isAuthenticated: false,
    role: "managementCompany",
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
