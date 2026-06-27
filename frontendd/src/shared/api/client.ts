import { clearBrowserAuthCookies } from "@/shared/lib/auth-session";
import { ROUTES } from "@/shared/lib/routes";

const appConfig = {
  name: "Domera",
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api",
};

function redirectToLogin() {
  if (typeof window === "undefined") return;

  const currentPath = `${window.location.pathname}${window.location.search}`;
  const loginUrl = new URL(ROUTES.login, window.location.origin);

  loginUrl.searchParams.set("expired", "1");

  if (currentPath && currentPath !== ROUTES.login) {
    loginUrl.searchParams.set("next", currentPath);
  }

  clearBrowserAuthCookies();
  window.location.assign(loginUrl.toString());
}

function isPublicAuthPath(path: string) {
  return (
    path.startsWith("/auth/login") ||
    path.startsWith("/auth/register") ||
    path.startsWith("/auth/register-email-code") ||
    path.startsWith("/auth/send-password-reset") ||
    path.startsWith("/auth/preview-password-reset") ||
    path.startsWith("/auth/confirm-password-reset") ||
    path.startsWith("/auth/account-catalog")
  );
}

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;

  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  if (!match?.[1]) return undefined;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export class DomeraApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "DomeraApiError";
  }
}

type ApiFetchInit = RequestInit & {
  redirectOnAuthError?: boolean;
};

export async function apiFetch<T>(path: string, init?: ApiFetchInit): Promise<T> {
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
  const url = `${appConfig.apiBaseUrl}${path}`;
  const { redirectOnAuthError = true, ...fetchInit } = init ?? {};
  const headers = new Headers(fetchInit.headers);
  const authToken = readCookie("authToken");

  if (!isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (authToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...fetchInit,
      headers,
      credentials: "include",
      cache: "no-store",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new DomeraApiError(`Network request failed for ${path} (${url}): ${message}`, 0);
  }

  const payload = (await response.json().catch(() => null)) as T | Record<string, unknown> | null;

  if (!response.ok) {
    const errorPayload = (payload && typeof payload === "object" ? payload : {}) as {
      message?: string | string[];
      error?: string;
    };

    const messageValue = Array.isArray(errorPayload.message)
      ? errorPayload.message.join(", ")
      : errorPayload.message || errorPayload.error || `Request failed for ${path}`;

    if (redirectOnAuthError && (response.status === 401 || response.status === 403) && !isPublicAuthPath(path)) {
      redirectToLogin();
    }

    throw new DomeraApiError(String(messageValue), response.status);
  }

  return payload as T;
}
