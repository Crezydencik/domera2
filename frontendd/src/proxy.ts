import { type NextRequest, NextResponse } from "next/server";
import { ROUTES } from "@/shared/lib/routes";
import { isAllowedPath, isAuthRoute, isProtectedPath, resolveDashboardRole, roleCookieValues } from "@/shared/api/access";

const authCookieNames = [
  "__session",
  "domera_role",
  "domera_accountType",
  "domera_companyId",
  "domera_apartmentId",
  "authToken",
  "userId",
  "userEmail",
] as const;

function redirectToLogin(request: NextRequest, pathname: string) {
  const loginUrl = new URL(ROUTES.login, request.url);
  const nextPath = `${pathname}${request.nextUrl.search}`;

  if (nextPath && nextPath !== ROUTES.login) {
    loginUrl.searchParams.set("next", nextPath);
  }

  const response = NextResponse.redirect(loginUrl);
  clearAuthCookies(response);
  return response;
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
  const pathname = request.nextUrl.pathname;
  const sessionCookie = request.cookies.get("__session")?.value?.trim();
  const cookieRole = request.cookies.get("domera_accountType")?.value ?? request.cookies.get("domera_role")?.value;
  const resolvedRole = resolveDashboardRole(cookieRole ?? request.nextUrl.searchParams.get("role"));
  const requestHeaders = new Headers(request.headers);

  requestHeaders.set("x-domera-role", resolvedRole);

  if (isProtectedPath(pathname) && !sessionCookie) {
    return redirectToLogin(request, pathname);
  }

  if (isAuthRoute(pathname) && sessionCookie) {
    const dashboardUrl = new URL(ROUTES.dashboard, request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  if (isProtectedPath(pathname) && !isAllowedPath(pathname, resolvedRole)) {
    const dashboardUrl = new URL(ROUTES.dashboard, request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  if (sessionCookie) {
    const cookieValue = roleCookieValues[resolvedRole];
    const cookieOptions = {
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      sameSite: "lax" as const,
    };

    response.cookies.set("domera_accountType", cookieValue, cookieOptions);
    response.cookies.set("domera_role", cookieValue, cookieOptions);
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
