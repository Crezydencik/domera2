import { clearBrowserAuthCookies } from "@/shared/lib/auth-session";
import { ROUTES } from "@/shared/lib/routes";

const appConfig = {
  name: "Domera",
  apiBaseUrl: "/api",
};

const DEFAULT_API_TIMEOUT_MS = 30_000;
const DEFAULT_CLIENT_STALE_TIME_MS = 15_000;

type ClientCacheEntry = {
  expiresAt: number;
  value: unknown;
};

const clientResponseCache = new Map<string, ClientCacheEntry>();
const clientInFlightRequests = new Map<string, Promise<unknown>>();

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
  staleTimeMs?: number;
  skipClientCache?: boolean;
};

function getRequestMethod(init?: RequestInit) {
  return (init?.method ?? "GET").toUpperCase();
}

function canUseClientCache(path: string, init?: ApiFetchInit) {
  if (init?.skipClientCache) return false;
  if (init?.signal) return false;
  if (getRequestMethod(init) !== "GET") return false;
  return !isPublicAuthPath(path);
}

function getClientCacheKey(path: string, init?: ApiFetchInit) {
  const headers = new Headers(init?.headers);
  const headerPairs = Array.from(headers.entries()).sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify({
    path,
    redirectOnAuthError: init?.redirectOnAuthError ?? true,
    headers: headerPairs,
  });
}

function toRequestInit(init?: ApiFetchInit): RequestInit {
  const fetchInit = { ...(init ?? {}) };
  delete fetchInit.redirectOnAuthError;
  delete fetchInit.staleTimeMs;
  delete fetchInit.skipClientCache;
  return fetchInit;
}

export function invalidateDomeraClientQueries(pathPrefix?: string) {
  if (!pathPrefix) {
    clientResponseCache.clear();
    return;
  }

  for (const [key] of clientResponseCache) {
    if (key.includes(`"path":"${pathPrefix}`)) {
      clientResponseCache.delete(key);
    }
  }
}

export async function apiFetch<T>(path: string, init?: ApiFetchInit): Promise<T> {
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
  const url = `${appConfig.apiBaseUrl}${path}`;
  const redirectOnAuthError = init?.redirectOnAuthError ?? true;
  const staleTimeMs = init?.staleTimeMs ?? DEFAULT_CLIENT_STALE_TIME_MS;
  const fetchInit = toRequestInit(init);
  const method = getRequestMethod(fetchInit);
  const useClientCache = canUseClientCache(path, init);
  const cacheKey = useClientCache ? getClientCacheKey(path, init) : "";
  const cached = cacheKey ? clientResponseCache.get(cacheKey) : undefined;

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as T;
  }

  const inFlight = cacheKey ? clientInFlightRequests.get(cacheKey) : undefined;
  if (inFlight) {
    return inFlight as Promise<T>;
  }

  const headers = new Headers(fetchInit.headers);
  const controller = fetchInit.signal ? null : new AbortController();
  const timeout = controller
    ? window.setTimeout(() => controller.abort(), resolveApiTimeoutMs())
    : null;

  if (!isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const requestPromise = (async () => {
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

    if (useClientCache && staleTimeMs > 0) {
      clientResponseCache.set(cacheKey, {
        expiresAt: Date.now() + staleTimeMs,
        value: payload,
      });
    }

    if (method !== "GET" && method !== "HEAD") {
      invalidateDomeraClientQueries();
    }

    return payload as T;
  })();

  if (cacheKey) {
    clientInFlightRequests.set(cacheKey, requestPromise);
  }

  try {
    return await requestPromise;
  } finally {
    if (cacheKey) {
      clientInFlightRequests.delete(cacheKey);
    }
  }
}
