import { NextResponse } from "next/server";

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

export function GET() {
  const apiKey = envValue("FIREBASE_WEB_API_KEY", "FIREBASE_API_KEY");
  const projectId = envValue("FIREBASE_PROJECT_ID");
  const appId = envValue("FIREBASE_WEB_APP_ID", "FIREBASE_APP_ID");
  const authDomain =
    envValue("FIREBASE_AUTH_DOMAIN", "PUBLIC_FIREBASE_AUTH_DOMAIN") ??
    (projectId ? `${projectId}.firebaseapp.com` : undefined);
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
