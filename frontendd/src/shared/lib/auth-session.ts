const AUTH_SESSION_EVENT = "domera:auth-session-changed";

export type BrowserAuthSession = {
  isAuthenticated: boolean;
  userId?: string;
  email?: string;
  accountType?: string;
  role: string;
  companyId?: string;
  apartmentId?: string;
};

const authCookieNames = [
  "__session",
  "domera_role",
  "domera_accountType",
  "domera_companyId",
  "domera_apartmentId",
  "authToken",
  "userId",
  "userEmail",
] as const;

function parseCookieString(value: string) {
  return value
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((accumulator, entry) => {
      const separatorIndex = entry.indexOf("=");

      if (separatorIndex === -1) {
        accumulator[entry] = "";
        return accumulator;
      }

      const key = entry.slice(0, separatorIndex).trim();
      const rawValue = entry.slice(separatorIndex + 1).trim();
      accumulator[key] = decodeURIComponent(rawValue);
      return accumulator;
    }, {});
}

export function readBrowserAuthSession(): BrowserAuthSession {
  if (typeof document === "undefined") {
    return {
      isAuthenticated: false,
      role: "managementCompany",
    };
  }

  const cookies = parseCookieString(document.cookie);
  const sessionToken = cookies.__session?.trim();
  const userId = cookies.userId?.trim();

  return {
    isAuthenticated: Boolean(sessionToken && userId),
    userId: userId || undefined,
    email: cookies.userEmail?.trim() || undefined,
    accountType: cookies.domera_accountType?.trim() || cookies.domera_role?.trim() || undefined,
    role: cookies.domera_role?.trim() || cookies.domera_accountType?.trim() || "managementCompany",
    companyId: cookies.domera_companyId?.trim() || undefined,
    apartmentId: cookies.domera_apartmentId?.trim() || undefined,
  };
}

export function notifyAuthSessionChanged() {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new Event(AUTH_SESSION_EVENT));
}

export function clearBrowserAuthCookies() {
  if (typeof document === "undefined") return;

  for (const name of authCookieNames) {
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
