import type { NextRequest } from "next/server";
import { buildRequestCookieHeader } from "@/shared/lib/cookie-header.server";

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

function resolveApiBaseUrl() {
  return (
    normalizeApiBaseUrl(process.env.API_BASE_URL) ??
    normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL) ??
    appendApiPath(process.env.BACKEND_URL) ??
    (process.env.NODE_ENV === "production" ? "https://domeraback.vercel.app/api" : "http://127.0.0.1:4000/api")
  );
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ invoiceId: string }> },
) {
  const { invoiceId } = await context.params;
  const cookieHeader = await buildRequestCookieHeader();
  const response = await fetch(`${resolveApiBaseUrl()}/invoices/${encodeURIComponent(invoiceId)}/pdf`, {
    headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    return new Response(null, { status: response.status });
  }

  // This route serves on the main site origin (www.domera.lv) with the user's cookies, so it must
  // never pass through anything but a PDF: an upstream text/html body would run as script here.
  const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (contentType !== "application/pdf") {
    return new Response(null, { status: 502 });
  }

  const headers = new Headers();
  const contentDisposition = response.headers.get("content-disposition");
  const contentLength = response.headers.get("content-length");

  headers.set("Content-Type", "application/pdf");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; object-src 'self'; frame-ancestors 'self'");
  headers.set("Cache-Control", "private, no-store");
  if (contentDisposition) headers.set("Content-Disposition", contentDisposition);
  if (contentLength) headers.set("Content-Length", contentLength);

  return new Response(response.body, { headers });
}
