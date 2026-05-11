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

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
  const url = `${appConfig.apiBaseUrl}${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...(init?.headers ?? {}),
      },
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

    if ((response.status === 401 || response.status === 403) && !isPublicAuthPath(path)) {
      redirectToLogin();
    }

    throw new DomeraApiError(String(messageValue), response.status);
  }

  return payload as T;
}
