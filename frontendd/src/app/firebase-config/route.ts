import { NextResponse } from "next/server";

const ALLOWED_HOSTS = new Set([
  "domera.lv",
  "www.domera.lv",
  "domerafront.vercel.app",
  "auth.domera.lv",
  "localhost:3000",
  "localhost:3001",
  "127.0.0.1:3000",
  "127.0.0.1:3001",
]);

function envValue(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }

  return undefined;
}

function inferMessagingSenderId(appId?: string) {
  const match = appId?.match(/^1:([^:]+):web:/);
  return match?.[1];
}

function resolveAuthDomain(request: Request, projectId?: string) {
  const requestHost =
    hostFromUrl(request.headers.get("origin")) ??
    hostFromUrl(request.headers.get("referer")) ??
    request.headers.get("host")?.toLowerCase();

  if (requestHost === "domera.lv" || requestHost === "www.domera.lv") {
    return "www.domera.lv";
  }

  if (requestHost === "domerafront.vercel.app") {
    return "domerafront.vercel.app";
  }

  const configured = envValue("FIREBASE_AUTH_DOMAIN", "PUBLIC_FIREBASE_AUTH_DOMAIN");
  if (configured && !configured.endsWith(".firebasestorage.app")) {
    return configured;
  }

  return projectId ? `${projectId}.firebaseapp.com` : undefined;
}

function hostFromUrl(value: string | null) {
  if (!value) return undefined;

  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return undefined;
  }
}

function configuredAllowedHosts() {
  return new Set(
    [
      process.env.FIREBASE_CONFIG_ALLOWED_HOSTS,
      process.env.VERCEL_URL,
      process.env.VERCEL_PROJECT_PRODUCTION_URL,
    ]
      .filter(Boolean)
      .join(",")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .map((host) => host.replace(/^https?:\/\//, ""))
      .filter(Boolean),
  );
}

function isAllowedHost(host?: string) {
  if (!host) return false;
  if (ALLOWED_HOSTS.has(host)) return true;
  if (configuredAllowedHosts().has(host)) return true;
  if (process.env.NODE_ENV !== "production" && /^(\d{1,3}\.){3}\d{1,3}:300\d$/.test(host)) return true;
  return false;
}

function isAllowedConfigRequest(request: Request) {
  const accept = request.headers.get("accept") ?? "";
  if (!accept.includes("application/json") && !accept.includes("*/*")) {
    return false;
  }

  const originHost = hostFromUrl(request.headers.get("origin"));
  const refererHost = hostFromUrl(request.headers.get("referer"));
  const host = originHost ?? refererHost ?? request.headers.get("host")?.toLowerCase();

  return isAllowedHost(host);
}

export function GET(request: Request) {
  if (!isAllowedConfigRequest(request)) {
    return new NextResponse(null, { status: 404 });
  }

  const apiKey = envValue("FIREBASE_WEB_API_KEY", "FIREBASE_API_KEY");
  const projectId = envValue("FIREBASE_PROJECT_ID");
  const appId = envValue("FIREBASE_WEB_APP_ID", "FIREBASE_APP_ID");
  const authDomain = resolveAuthDomain(request, projectId);
  const storageBucket = envValue("FIREBASE_STORAGE_BUCKET");
  const messagingSenderId = envValue("FIREBASE_MESSAGING_SENDER_ID") ?? inferMessagingSenderId(appId);

  // Firebase Authentication only needs the API key, project ID, and auth
  // domain. `appId` is useful for services such as Analytics or Messaging,
  // but it is not required to initialise Firebase Auth. Requiring it here
  // incorrectly disables Google sign-in in deployments that do not use those
  // services.
  if (!apiKey || !projectId || !authDomain) {
    return NextResponse.json(
      {
        message:
          "Google sign-in is not configured. Set FIREBASE_WEB_API_KEY, FIREBASE_PROJECT_ID, and FIREBASE_AUTH_DOMAIN or PUBLIC_FIREBASE_AUTH_DOMAIN.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
  });
}
