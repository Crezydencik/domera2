import "server-only";

import { cookies } from "next/headers";
import { buildCookieHeaderFromStore } from "@/shared/lib/cookie-header.server";

function trimTrailingSlashes(value: string) {
  return value.replace(/\/+$/, "");
}

function normalizeApiBaseUrl(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimTrailingSlashes(trimmed);
  }

  return undefined;
}

function appendApiPath(value?: string) {
  const baseUrl = normalizeApiBaseUrl(value);
  if (!baseUrl) return undefined;

  return baseUrl.endsWith("/api") ? baseUrl : `${baseUrl}/api`;
}

function resolveServerApiBaseUrl() {
  return (
    normalizeApiBaseUrl(process.env.API_BASE_URL) ??
    normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL) ??
    appendApiPath(process.env.BACKEND_URL) ??
    (process.env.NODE_ENV === "production" ? "https://domeraback.vercel.app/api" : "http://127.0.0.1:4000/api")
  );
}

const appConfig = {
  apiBaseUrl: resolveServerApiBaseUrl(),
};

const DEFAULT_SERVER_API_TIMEOUT_MS = process.env.NODE_ENV === "production" ? 15_000 : 5_000;
const DEFAULT_SERVER_STALE_TIME_MS = 5_000;

type ServerCacheEntry = {
  expiresAt: number;
  value: unknown;
};

const serverResponseCache = new Map<string, ServerCacheEntry>();
const serverInFlightRequests = new Map<string, Promise<unknown>>();

function resolveServerApiTimeoutMs() {
  const value = Number(process.env.SERVER_API_TIMEOUT_MS ?? DEFAULT_SERVER_API_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_SERVER_API_TIMEOUT_MS;
}

function resolveServerStaleTimeMs(init?: ServerApiFetchInit) {
  const value = Number(init?.serverStaleTimeMs ?? process.env.SERVER_API_STALE_TIME_MS ?? DEFAULT_SERVER_STALE_TIME_MS);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export type ServerApiFetchInit = RequestInit & {
  revalidate?: number;
  tags?: string[];
  serverStaleTimeMs?: number;
  skipServerCache?: boolean;
};

export class DomeraApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "DomeraApiError";
  }
}

async function parseJsonResponse<T>(response: Response, path: string): Promise<T> {
  if (response.status === 204 || response.status === 205) {
    return {} as T;
  }

  const raw = await response.text();
  if (!raw.trim()) {
    return {} as T;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new DomeraApiError(`Invalid JSON response for ${path}`, response.status || 500);
  }
}

function canUseServerCache(method: string, init?: ServerApiFetchInit) {
  if (init?.skipServerCache) return false;
  if (init?.signal) return false;
  return method === "GET" || method === "HEAD";
}

function getServerCacheKey(url: string, method: string, headers: Headers) {
  const headerPairs = Array.from(headers.entries()).sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify({ method, url, headers: headerPairs });
}

export async function apiFetch<T>(path: string, init?: ServerApiFetchInit): Promise<T> {
  const store = await cookies();
  const cookieHeader = buildCookieHeaderFromStore(store);
  const url = `${appConfig.apiBaseUrl}${path}`;
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
  const headers = new Headers(init?.headers);
  const { revalidate, tags, serverStaleTimeMs, skipServerCache, ...fetchInit } = init ?? {};
  const method = typeof fetchInit.method === "string" ? fetchInit.method.toUpperCase() : "GET";
  const canUseNextCache = method === "GET" || method === "HEAD";

  if (!isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (cookieHeader && !headers.has("Cookie")) {
    headers.set("Cookie", cookieHeader);
  }

  const useServerCache = canUseServerCache(method, init);
  const staleTimeMs = useServerCache ? resolveServerStaleTimeMs({ ...init, serverStaleTimeMs, skipServerCache }) : 0;
  const cacheKey = useServerCache && staleTimeMs > 0 ? getServerCacheKey(url, method, headers) : "";
  const cached = cacheKey ? serverResponseCache.get(cacheKey) : undefined;

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as T;
  }

  const inFlight = cacheKey ? serverInFlightRequests.get(cacheKey) : undefined;
  if (inFlight) {
    return inFlight as Promise<T>;
  }

  const requestPromise = (async () => {
    const controller = init?.signal ? null : new AbortController();
    const timeout = controller
      ? setTimeout(() => controller.abort(), Math.max(1000, resolveServerApiTimeoutMs()))
      : null;

    let response: Response;
    try {
      response = await fetch(url, {
        ...fetchInit,
        headers,
        signal: fetchInit.signal ?? controller?.signal,
        cache: canUseNextCache && revalidate !== undefined ? undefined : "no-store",
        next: canUseNextCache && (revalidate !== undefined || tags?.length)
          ? {
              ...(revalidate !== undefined ? { revalidate } : {}),
              ...(tags?.length ? { tags } : {}),
            }
          : undefined,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DomeraApiError(`Fetch failed for ${path} (${url}): ${message}`, 500);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }

    if (!response.ok) {
      throw new DomeraApiError(`Request failed for ${path}`, response.status);
    }

    const payload = await parseJsonResponse<T>(response, path);
    if (cacheKey) {
      serverResponseCache.set(cacheKey, {
        expiresAt: Date.now() + staleTimeMs,
        value: payload,
      });
    }

    return payload;
  })();

  if (cacheKey) {
    serverInFlightRequests.set(cacheKey, requestPromise);
  }

  try {
    return await requestPromise;
  } finally {
    if (cacheKey) {
      serverInFlightRequests.delete(cacheKey);
    }
  }
}

export async function apiFetchSafe<T>(path: string): Promise<T | null> {
  try {
    return await apiFetch<T>(path);
  } catch {
    return null;
  }
}
