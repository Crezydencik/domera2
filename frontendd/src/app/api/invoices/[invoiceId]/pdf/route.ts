import type { NextRequest } from "next/server";
import { buildRequestCookieHeader } from "@/shared/lib/cookie-header.server";

function resolveApiBaseUrl() {
  const configured = process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL;
  if (configured?.startsWith("http://") || configured?.startsWith("https://")) {
    return configured;
  }

  return "http://127.0.0.1:4000/api";
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

  const headers = new Headers();
  const contentType = response.headers.get("content-type");
  const contentDisposition = response.headers.get("content-disposition");
  const contentLength = response.headers.get("content-length");

  if (contentType) headers.set("Content-Type", contentType);
  if (contentDisposition) headers.set("Content-Disposition", contentDisposition);
  if (contentLength) headers.set("Content-Length", contentLength);

  return new Response(response.body, { headers });
}
