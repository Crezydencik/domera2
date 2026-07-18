import { type NextRequest, NextResponse } from "next/server";
import { ROUTES } from "@/shared/lib/routes";
import { isAllowedPath, isAuthRoute, isProtectedPath, resolveDashboardRole, roleCookieValues } from "@/shared/api/access";

const authCookieNames = [
  "__session",
  "domera_session",
  "domera_role",
  "domera_accountType",
  "domera_companyId",
  "domera_apartmentId",
  "userId",
  "userEmail",
] as const;

const productionHosts = new Set(["domera.lv", "www.domera.lv"]);

function withSecurityHeaders(response: NextResponse) {
  response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  return response;
}

function redirectToHttps(request: NextRequest) {
  const host = request.headers.get("host")?.toLowerCase() ?? "";
  const protocol = request.headers.get("x-forwarded-proto")?.toLowerCase();

  if (!productionHosts.has(host) || protocol !== "http") {
    return undefined;
  }

  const url = request.nextUrl.clone();
  url.protocol = "https:";
  url.host = host;

  return withSecurityHeaders(NextResponse.redirect(url, 308));
}

function redirectToLogin(request: NextRequest, pathname: string) {
  const loginUrl = new URL(ROUTES.login, request.url);
  const nextPath = `${pathname}${request.nextUrl.search}`;

  if (nextPath && nextPath !== ROUTES.login) {
    loginUrl.searchParams.set("next", nextPath);
  }

  const response = NextResponse.redirect(loginUrl);
  clearAuthCookies(response);
  return withSecurityHeaders(response);
}

function clearAuthCookies(response: NextResponse) {
  for (const name of authCookieNames) {
    response.cookies.set(name, "", {
      path: "/",
      maxAge: 0,
      sameSite: "lax",
    });
  }
}

export default function proxy(request: NextRequest) {
  const httpsRedirect = redirectToHttps(request);
  if (httpsRedirect) return httpsRedirect;

  const pathname = request.nextUrl.pathname;
  const sessionCookie = request.cookies.get("__session")?.value?.trim();
  const sessionMarker = request.cookies.get("domera_session")?.value?.trim();
  const isAuthenticated = Boolean(sessionCookie || sessionMarker);
  const shouldClearAuth = request.nextUrl.searchParams.get("expired") === "1";
  const cookieRole = request.cookies.get("domera_role")?.value ?? request.cookies.get("domera_accountType")?.value;
  const resolvedRole = resolveDashboardRole(cookieRole);
  const requestHeaders = new Headers(request.headers);

  requestHeaders.set("x-domera-role", resolvedRole);

  if (isAuthRoute(pathname) && shouldClearAuth) {
    const response = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
    clearAuthCookies(response);
    return withSecurityHeaders(response);
  }

  if (isProtectedPath(pathname) && !isAuthenticated) {
    return redirectToLogin(request, pathname);
  }

  if (isAuthRoute(pathname) && isAuthenticated) {
    const dashboardUrl = new URL(ROUTES.dashboard, request.url);
    return withSecurityHeaders(NextResponse.redirect(dashboardUrl));
  }

  if (isProtectedPath(pathname) && !isAllowedPath(pathname, resolvedRole)) {
    const dashboardUrl = new URL(ROUTES.dashboard, request.url);
    return withSecurityHeaders(NextResponse.redirect(dashboardUrl));
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  if (isAuthenticated) {
    const cookieValue = roleCookieValues[resolvedRole];
    const cookieOptions = {
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      sameSite: "lax" as const,
    };

    response.cookies.set("domera_accountType", cookieValue, cookieOptions);
    response.cookies.set("domera_role", cookieValue, cookieOptions);
    response.cookies.set("domera_session", "1", cookieOptions);
  }

  return withSecurityHeaders(response);
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
