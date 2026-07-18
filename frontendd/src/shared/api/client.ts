import { clearBrowserAuthCookies } from "@/shared/lib/auth-session";
import { ROUTES } from "@/shared/lib/routes";

const appConfig = {
  name: "Domera",
  apiBaseUrl: "/api",
};

const DEFAULT_API_TIMEOUT_MS = 30_000;

function resolveApiTimeoutMs() {
  const value = Number(process.env.NEXT_PUBLIC_API_TIMEOUT_MS ?? DEFAULT_API_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_API_TIMEOUT_MS;
}

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
  const controller = fetchInit.signal ? null : new AbortController();
  const timeout = controller
    ? window.setTimeout(() => controller.abort(), resolveApiTimeoutMs())
    : null;

  if (!isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...fetchInit,
      headers,
      credentials: "include",
      cache: "no-store",
      signal: fetchInit.signal ?? controller?.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new DomeraApiError(`Request timed out for ${path} (${url})`, 0);
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new DomeraApiError(`Network request failed for ${path} (${url}): ${message}`, 0);
  } finally {
    if (timeout) {
      window.clearTimeout(timeout);
    }
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
