import { NextResponse } from "next/server";
import { ROUTES } from "@/shared/lib/routes";

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

function expireCookieHeader(name: string, attributes = "") {
  return `${name}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${attributes}`;
}

function cookieDomainVariants(hostname: string) {
  const host = hostname.split(":")[0]?.toLowerCase() ?? "";
  const domains = new Set<string>();

  if (host && host !== "localhost" && host !== "127.0.0.1") {
    domains.add(host);
  }

  if (host === "domera.lv" || host === "www.domera.lv" || host.endsWith(".domera.lv")) {
    domains.add("domera.lv");
    domains.add(".domera.lv");
  }

  return [...domains];
}

function expireAuthCookies(response: NextResponse, request: Request) {
  const hostname = new URL(request.url).hostname;

  for (const name of authCookieNamesToClear) {
    response.headers.append("Set-Cookie", expireCookieHeader(name, "; SameSite=Lax"));
    response.headers.append("Set-Cookie", expireCookieHeader(name, "; SameSite=None; Secure"));

    for (const domain of cookieDomainVariants(hostname)) {
      response.headers.append("Set-Cookie", expireCookieHeader(name, `; Domain=${domain}; SameSite=Lax`));
      response.headers.append("Set-Cookie", expireCookieHeader(name, `; Domain=${domain}; SameSite=None; Secure`));
    }
  }
}

async function clearBackendCookies(request: Request) {
  try {
    const url = new URL("/api/auth/clear-cookies", request.url);

    await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: {
        cookie: request.headers.get("cookie") ?? "",
      },
      cache: "no-store",
    });
  } catch {
    // The frontend response still expires the browser cookies for this host.
  }
}

export async function GET(request: Request) {
  await clearBackendCookies(request);

  const redirectUrl = new URL(ROUTES.login, request.url);
  redirectUrl.searchParams.set("expired", "1");

  const response = NextResponse.redirect(redirectUrl, 303);
  expireAuthCookies(response, request);
  return response;
}

export async function POST(request: Request) {
  return GET(request);
}
