import { NextResponse } from "next/server";

const ALLOWED_HOSTS = new Set([
  "domera.lv",
  "www.domera.lv",
  "domerafront.vercel.app",
  "auth.domera.lv",
  "localhost:3000",
  "localhost:3001",
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

function resolveAuthDomain(projectId?: string) {
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

function isAllowedConfigRequest(request: Request) {
  const accept = request.headers.get("accept") ?? "";
  if (!accept.includes("application/json") && !accept.includes("*/*")) {
    return false;
  }

  const originHost = hostFromUrl(request.headers.get("origin"));
  const refererHost = hostFromUrl(request.headers.get("referer"));
  const host = originHost ?? refererHost;

  return Boolean(host && ALLOWED_HOSTS.has(host));
}

export function GET(request: Request) {
  if (!isAllowedConfigRequest(request)) {
    return new NextResponse(null, { status: 404 });
  }

  const apiKey = envValue("FIREBASE_WEB_API_KEY", "FIREBASE_API_KEY");
  const projectId = envValue("FIREBASE_PROJECT_ID");
  const appId = envValue("FIREBASE_WEB_APP_ID", "FIREBASE_APP_ID");
  const authDomain = resolveAuthDomain(projectId);
  const storageBucket = envValue("FIREBASE_STORAGE_BUCKET");
  const messagingSenderId = envValue("FIREBASE_MESSAGING_SENDER_ID") ?? inferMessagingSenderId(appId);

  if (!apiKey || !projectId || !appId || !authDomain) {
    return NextResponse.json(
      {
        message:
          "Google sign-in is not configured. Set FIREBASE_WEB_API_KEY, FIREBASE_PROJECT_ID, FIREBASE_WEB_APP_ID, and FIREBASE_AUTH_DOMAIN or PUBLIC_FIREBASE_AUTH_DOMAIN.",
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
