"use client";

import { getApp, getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import { getAuth } from "firebase/auth";

function requireFirebaseConfigValue(name: string, value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`Firebase client config is missing ${name}.`);
  }

  return trimmed;
}

function getFirebaseConfig(): FirebaseOptions {
  return {
    apiKey: requireFirebaseConfigValue("NEXT_PUBLIC_FIREBASE_API_KEY", process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
    authDomain: requireFirebaseConfigValue(
      "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    ),
    projectId: requireFirebaseConfigValue("NEXT_PUBLIC_FIREBASE_PROJECT_ID", process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() || undefined,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim() || undefined,
    appId: requireFirebaseConfigValue("NEXT_PUBLIC_FIREBASE_APP_ID", process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
  };
}

export function getFirebaseAuth() {
  const app = getApps().length ? getApp() : initializeApp(getFirebaseConfig());
  return getAuth(app);
}
