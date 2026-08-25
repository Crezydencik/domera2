import { type NextRequest, NextResponse } from "next/server";
import { ROUTES } from "@/shared/lib/routes";
import { isAuthRoute, isProtectedPath } from "@/shared/api/access";

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

const productionHosts = new Set(["domera.lv", "www.domera.lv"]);

function withSecurityHeaders(response: NextResponse) {
  response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  return response;
}

function redirectToHttps(request: NextRequest) {
  const host = request.headers.get("host")?.toLowerCase() ?? "";
  const protocol = request.headers.get("x-forwarded-proto")?.toLowerCase();

  if (!productionHosts.has(host)) {
    return undefined;
  }

  if (host === "domera.lv") {
    const url = request.nextUrl.clone();
    url.protocol = "https:";
    url.host = "www.domera.lv";

    return withSecurityHeaders(NextResponse.redirect(url, 308));
  }

  if (protocol !== "http") {
    return undefined;
  }

  const url = request.nextUrl.clone();
  url.protocol = "https:";
  url.host = host;

  return withSecurityHeaders(NextResponse.redirect(url, 308));
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

function expireCookieHeader(name: string, attributes = "") {
  return `${name}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${attributes}`;
}

function clearAuthCookies(response: NextResponse, request?: NextRequest) {
  for (const name of authCookieNamesToClear) {
    response.cookies.set(name, "", {
      path: "/",
      maxAge: 0,
      sameSite: "lax",
    });

    response.headers.append("Set-Cookie", expireCookieHeader(name, "; SameSite=Lax"));
    response.headers.append("Set-Cookie", expireCookieHeader(name, "; SameSite=None; Secure"));

    if (request) {
      for (const domain of cookieDomainVariants(request.nextUrl.hostname)) {
        response.headers.append("Set-Cookie", expireCookieHeader(name, `; Domain=${domain}; SameSite=Lax`));
        response.headers.append("Set-Cookie", expireCookieHeader(name, `; Domain=${domain}; SameSite=None; Secure`));
      }
    }
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const payload = token.split(".")[1];
  if (!payload) return {};

  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    return JSON.parse(atob(base64)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function matchesPath(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

function isAccountantRole(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/[^a-z]/gi, "")
    .toLowerCase() === "accountant";
}

function setRequestHeader(requestHeaders: Headers, name: string, value: unknown) {
  const text = firstString(value);
  if (text && /^[\x20-\x7e]+$/.test(text)) requestHeaders.set(name, text);
}

function redirectToLogin(request: NextRequest, pathname: string) {
  const loginUrl = new URL(ROUTES.login, request.url);
  const nextPath = `${pathname}${request.nextUrl.search}`;

  if (nextPath && nextPath !== ROUTES.login) {
    loginUrl.searchParams.set("next", nextPath);
  }

  const response = NextResponse.redirect(loginUrl);
  clearAuthCookies(response, request);
  return withSecurityHeaders(response);
}

export default function proxy(request: NextRequest) {
  const httpsRedirect = redirectToHttps(request);
  if (httpsRedirect) return httpsRedirect;

  const pathname = request.nextUrl.pathname;
  const sessionCookie = request.cookies.get("__session")?.value?.trim();
  const sessionPayload = sessionCookie ? decodeJwtPayload(sessionCookie) : {};
  const legacyUserId = firstString(request.cookies.get("userId")?.value);
  const legacyEmail = firstString(request.cookies.get("userEmail")?.value);
  const legacyRole = firstString(
    request.cookies.get("domera_role")?.value,
    request.cookies.get("domera_accountType")?.value,
  );
  const legacyCompanyId = firstString(request.cookies.get("domera_companyId")?.value);
  const legacyApartmentId = firstString(request.cookies.get("domera_apartmentId")?.value);
  const isAuthenticated = Boolean(sessionCookie || legacyUserId || legacyEmail || legacyRole);
  const shouldClearAuth = request.nextUrl.searchParams.get("expired") === "1";
  const trustedRole = firstString(sessionPayload.role, sessionPayload.accountType);
  const roleHint = trustedRole ?? legacyRole;
  const requestHeaders = new Headers(request.headers);

  requestHeaders.delete("x-domera-role");
  requestHeaders.delete("x-domera-user-id");
  requestHeaders.delete("x-domera-email");
  requestHeaders.delete("x-domera-company-id");
  requestHeaders.delete("x-domera-apartment-id");

  if (roleHint) {
    requestHeaders.set("x-domera-role", roleHint);
  }
  setRequestHeader(requestHeaders, "x-domera-user-id", firstString(sessionPayload.uid, sessionPayload.user_id, legacyUserId));
  setRequestHeader(requestHeaders, "x-domera-email", firstString(sessionPayload.email, legacyEmail));
  setRequestHeader(requestHeaders, "x-domera-company-id", firstString(sessionPayload.companyId, legacyCompanyId));
  setRequestHeader(requestHeaders, "x-domera-apartment-id", firstString(sessionPayload.apartmentId, legacyApartmentId));

  if (pathname === ROUTES.logout) {
    return withSecurityHeaders(NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    }));
  }

  if (isAuthRoute(pathname) && shouldClearAuth) {
    const response = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
    clearAuthCookies(response, request);
    return withSecurityHeaders(response);
  }

  if (isProtectedPath(pathname) && !isAuthenticated) {
    return redirectToLogin(request, pathname);
  }

  if (
    isAuthenticated &&
    isAccountantRole(roleHint) &&
    matchesPath(pathname, ROUTES.residents)
  ) {
    const apartmentsUrl = new URL(ROUTES.apartments, request.url);
    return withSecurityHeaders(NextResponse.redirect(apartmentsUrl));
  }

  if (isAuthRoute(pathname) && isAuthenticated) {
    const dashboardUrl = new URL(ROUTES.dashboard, request.url);
    return withSecurityHeaders(NextResponse.redirect(dashboardUrl));
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  return withSecurityHeaders(response);
}

export const config = {
  matcher: [
    "/login/:path*",
    "/logout",
    "/register/:path*",
    "/forgot-password/:path*",
    "/reset-password/:path*",
    "/accept-invitation/:path*",
    "/dashboard/:path*",
    "/platform-users/:path*",
    "/approvals/:path*",
    "/admin-buildings/:path*",
    "/platform-billing/:path*",
    "/buildings/:path*",
    "/apartments/:path*",
    "/residents/:path*",
    "/invoices/:path*",
    "/electricity/:path*",
    "/meter-readings/:path*",
    "/debts/:path*",
    "/documents/:path*",
    "/notifications/:path*",
    "/settings/:path*",
  ],
};
