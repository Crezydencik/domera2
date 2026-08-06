import "server-only";

import { cookies } from "next/headers";
import { buildCookieHeaderFromStore } from "@/shared/lib/cookie-header.server";

function resolveServerApiBaseUrl() {
  const configured = process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL;
  if (configured?.startsWith("http://") || configured?.startsWith("https://")) {
    return configured;
  }

  return "http://127.0.0.1:4000/api";
}

const appConfig = {
  apiBaseUrl: resolveServerApiBaseUrl(),
};

const SERVER_API_TIMEOUT_MS = Number(process.env.SERVER_API_TIMEOUT_MS ?? 15000);

export type ServerApiFetchInit = RequestInit & {
  revalidate?: number;
  tags?: string[];
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

export async function apiFetch<T>(path: string, init?: ServerApiFetchInit): Promise<T> {
  const store = await cookies();
  const cookieHeader = buildCookieHeaderFromStore(store);
  const url = `${appConfig.apiBaseUrl}${path}`;
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
  const headers = new Headers(init?.headers);
  const { revalidate, tags, ...fetchInit } = init ?? {};
  const method = typeof fetchInit.method === "string" ? fetchInit.method.toUpperCase() : "GET";
  const canUseNextCache = method === "GET" || method === "HEAD";
  const controller = init?.signal ? null : new AbortController();
  const timeout = controller
    ? setTimeout(() => controller.abort(), Math.max(1000, SERVER_API_TIMEOUT_MS))
    : null;

  if (!isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (cookieHeader && !headers.has("Cookie")) {
    headers.set("Cookie", cookieHeader);
  }

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

  return parseJsonResponse<T>(response, path);
}

export async function apiFetchSafe<T>(path: string): Promise<T | null> {
  try {
    return await apiFetch<T>(path);
  } catch {
    return null;
  }
}
