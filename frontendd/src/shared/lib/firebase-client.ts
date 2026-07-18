"use client";

import { getApp, getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import { getAuth } from "firebase/auth";

let firebaseConfigPromise: Promise<FirebaseOptions> | null = null;

async function getFirebaseConfig(): Promise<FirebaseOptions> {
  firebaseConfigPromise ??= fetch("/firebase-config", {
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  }).then(async (response) => {
    const payload = (await response.json().catch(() => null)) as FirebaseOptions | { message?: string } | null;

    if (!response.ok) {
      const message = payload && "message" in payload ? payload.message : undefined;
      throw new Error(message || "Google sign-in is not configured.");
    }

    return payload as FirebaseOptions;
  });

  return firebaseConfigPromise;
}

export async function getFirebaseAuth() {
  const app = getApps().length ? getApp() : initializeApp(await getFirebaseConfig());
  return getAuth(app);
}
