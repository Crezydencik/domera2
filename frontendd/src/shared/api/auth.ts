"use client";

import {
  type Auth,
  type User,
} from "firebase/auth";
import { apiFetch } from "@/shared/api/client";
import { notifyAuthSessionChanged } from "@/shared/lib/auth-session";

export type PublicAccountType = "PlatformAdmin" | "ManagementCompany" | "Resident" | "Landlord";

export type PublicUserRole = "PlatformAdmin" | "ManagementCompany" | "Accountant" | "Resident" | "Landlord";

export type RegisterInput = {
  email: string;
  password: string;
  accountType: PublicAccountType;
  verificationToken: string;
  acceptedPrivacyPolicy: boolean;
  acceptedTerms: boolean;
  firstName?: string;
  lastName?: string;
  phone?: string;
  companyName?: string;
  companyEmail?: string;
  registrationNumber?: string;
};

type FirebaseAuthResult = {
  userId: string;
  email: string;
  preview: boolean;
  role: PublicUserRole;
  accountType: PublicAccountType;
  companyId?: string;
  apartmentId?: string;
  rememberMe?: boolean;
};

type BackendAuthResponse = {
  success?: boolean;
  userId?: string;
  email?: string;
  role?: string;
  accountType?: string;
  companyId?: string;
  apartmentId?: string;
};

type RegisterCodeResponse = {
  success?: boolean;
  expiresInSeconds?: number;
};

type RegisterCodeVerifyResponse = {
  success?: boolean;
  verificationToken?: string;
  expiresInSeconds?: number;
};

const GOOGLE_REDIRECT_REMEMBER_ME_KEY = "domera_google_redirect_remember_me";
const GOOGLE_REDIRECT_PENDING_KEY = "domera_google_redirect_pending";
const GOOGLE_REDIRECT_FALLBACK_TIMEOUT_MS = 3_500;

async function getFirebaseAuthClient() {
  const { getFirebaseAuth } = await import("@/shared/lib/firebase-client");
  return getFirebaseAuth();
}

async function getFirebaseAuthModule() {
  return import("firebase/auth");
}

function normalizeAccountType(value?: string | null): PublicAccountType {
  const normalized = String(value ?? "")
    .trim()
    .replace(/[^a-z]/gi, "")
    .toLowerCase();

  if (normalized === "platformadmin" || normalized === "superadmin" || normalized === "admin") {
    return "PlatformAdmin";
  }

  if (normalized === "resident" || normalized === "tenant" || normalized === "renter") {
    return "Resident";
  }

  if (normalized === "landlord" || normalized === "owner") {
    return "Landlord";
  }

  return "ManagementCompany";
}

function normalizeRole(value?: string | null): PublicUserRole {
  const normalized = String(value ?? "")
    .trim()
    .replace(/[^a-z]/gi, "")
    .toLowerCase();

  if (normalized === "platformadmin" || normalized === "superadmin" || normalized === "admin") {
    return "PlatformAdmin";
  }

  if (normalized === "accountant") {
    return "Accountant";
  }

  if (normalized === "resident" || normalized === "tenant" || normalized === "renter") {
    return "Resident";
  }

  if (normalized === "landlord" || normalized === "owner") {
    return "Landlord";
  }

  return "ManagementCompany";
}

function persistSessionHints(params: {
  role: PublicUserRole;
  accountType: PublicAccountType;
  email: string;
  name?: string;
  userId?: string;
  companyId?: string;
  apartmentId?: string;
  rememberMe?: boolean;
}) {
  void params;
  notifyAuthSessionChanged();
}

function resolvePayloadName(payload: Record<string, unknown>): string | undefined {
  const firstName = typeof payload.firstName === "string" ? payload.firstName.trim() : "";
  const lastName = typeof payload.lastName === "string" ? payload.lastName.trim() : "";
  const joinedName = [firstName, lastName].filter(Boolean).join(" ").trim();

  return (
    joinedName ||
    (typeof payload.fullName === "string" ? payload.fullName.trim() : "") ||
    (typeof payload.name === "string" ? payload.name.trim() : "") ||
    (typeof payload.displayName === "string" ? payload.displayName.trim() : "") ||
    undefined
  );
}

function persistBrowserName(name: string) {
  void name;
  notifyAuthSessionChanged();
}

function persistBrowserEmail(email: string) {
  void email;
  notifyAuthSessionChanged();
}

function mapAuthResponse(data: BackendAuthResponse, fallbackEmail: string, fallbackAccountType: PublicAccountType): FirebaseAuthResult {
  if (!data.userId) {
    throw new Error("Authentication response is incomplete.");
  }

  return {
    userId: data.userId,
    email: data.email ?? fallbackEmail,
    preview: false,
    role: normalizeRole(data.role ?? data.accountType ?? fallbackAccountType),
    accountType: normalizeAccountType(data.accountType ?? data.role ?? fallbackAccountType),
    companyId: data.companyId,
    apartmentId: data.apartmentId,
  };
}

async function createGoogleProvider() {
  const { GoogleAuthProvider } = await getFirebaseAuthModule();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}

function shouldUseGoogleRedirect() {
  if (typeof window === "undefined") return false;

  const userAgent = window.navigator.userAgent;
  const isTouchLikeDevice =
    window.matchMedia?.("(hover: none), (pointer: coarse)")?.matches ?? false;
  const isMobileUserAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);

  return isTouchLikeDevice || isMobileUserAgent;
}

function isPopupBlockedError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("popup-blocked") || message.includes("popup_closed_by_user");
}

function storeGoogleRedirectRememberMe(rememberMe?: boolean) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(GOOGLE_REDIRECT_PENDING_KEY, "1");
  window.sessionStorage.setItem(GOOGLE_REDIRECT_REMEMBER_ME_KEY, rememberMe ? "1" : "0");
}

function hasPendingGoogleRedirect() {
  return typeof window !== "undefined" && window.sessionStorage.getItem(GOOGLE_REDIRECT_PENDING_KEY) === "1";
}

export function hasPendingGoogleRedirectSignIn() {
  return hasPendingGoogleRedirect();
}

function readGoogleRedirectRememberMe() {
  if (typeof window === "undefined") return false;

  return window.sessionStorage.getItem(GOOGLE_REDIRECT_REMEMBER_ME_KEY) === "1";
}

function clearGoogleRedirectState() {
  if (typeof window === "undefined") return;

  window.sessionStorage.removeItem(GOOGLE_REDIRECT_PENDING_KEY);
  window.sessionStorage.removeItem(GOOGLE_REDIRECT_REMEMBER_ME_KEY);
}

function canonicalizeGoogleRedirectHost() {
  if (typeof window === "undefined" || window.location.hostname !== "domera.lv") {
    return false;
  }

  const nextUrl = new URL(window.location.href);
  nextUrl.protocol = "https:";
  nextUrl.hostname = "www.domera.lv";
  window.location.assign(nextUrl.toString());
  return true;
}

function waitForRedirectUser(auth: Auth) {
  return new Promise<User | null>((resolve) => {
    let settled = false;
    let unsubscribe: () => void = () => undefined;
    const finish = (user: User | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      unsubscribe();
      resolve(user);
    };
    const timeout = window.setTimeout(() => finish(auth.currentUser), GOOGLE_REDIRECT_FALLBACK_TIMEOUT_MS);

    void getFirebaseAuthModule()
      .then(({ onAuthStateChanged }) => {
        if (settled) return;
        unsubscribe = onAuthStateChanged(auth, finish);
      })
      .catch(() => {
        finish(auth.currentUser);
      });
  });
}

async function createGoogleBackendSession(user: User, rememberMe?: boolean): Promise<FirebaseAuthResult> {
  const idToken = await user.getIdToken();
  const email = user.email?.trim().toLowerCase() ?? "";

  const data = await apiFetch<BackendAuthResponse>("/auth/session", {
    method: "POST",
    body: JSON.stringify({
      idToken,
      userId: user.uid,
      email: email || undefined,
      rememberMe,
    }),
  });

  return {
    ...mapAuthResponse(
      {
        ...data,
        userId: data.userId ?? user.uid,
        email: data.email ?? email,
      },
      email,
      "ManagementCompany",
    ),
    rememberMe,
  };
}

async function startGoogleRedirectSignIn(rememberMe?: boolean): Promise<FirebaseAuthResult> {
  if (canonicalizeGoogleRedirectHost()) {
    return new Promise(() => undefined);
  }

  storeGoogleRedirectRememberMe(rememberMe);
  const { signInWithRedirect } = await getFirebaseAuthModule();
  await signInWithRedirect(await getFirebaseAuthClient(), await createGoogleProvider());
  return new Promise(() => undefined);
}

export async function signInWithEmailPassword(
  email: string,
  password: string,
  rememberMe?: boolean,
): Promise<FirebaseAuthResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const data = await apiFetch<BackendAuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: normalizedEmail,
      password,
      rememberMe,
    }),
  });

  return mapAuthResponse(data, normalizedEmail, "ManagementCompany");
}

export async function signInWithGoogle(rememberMe?: boolean): Promise<FirebaseAuthResult> {
  if (shouldUseGoogleRedirect()) {
    return startGoogleRedirectSignIn(rememberMe);
  }

  try {
    const { signInWithPopup } = await getFirebaseAuthModule();
    const credential = await signInWithPopup(await getFirebaseAuthClient(), await createGoogleProvider());
    return createGoogleBackendSession(credential.user, rememberMe);
  } catch (error) {
    if (isPopupBlockedError(error)) {
      return startGoogleRedirectSignIn(rememberMe);
    }

    throw error;
  }
}

export async function completeGoogleRedirectSignIn(): Promise<FirebaseAuthResult | null> {
  const hadPendingRedirect = hasPendingGoogleRedirect();

  if (!hadPendingRedirect) {
    return null;
  }

  const { getRedirectResult } = await getFirebaseAuthModule();
  const auth = await getFirebaseAuthClient();
  const credential = await getRedirectResult(auth);
  const rememberMe = readGoogleRedirectRememberMe();
  const user = credential?.user ?? (hadPendingRedirect ? auth.currentUser ?? await waitForRedirectUser(auth) : null);

  if (!user) {
    if (hadPendingRedirect) {
      clearGoogleRedirectState();
      throw new Error("Google sign-in returned without an authenticated Firebase user.");
    }

    return null;
  }

  const session = await createGoogleBackendSession(user, rememberMe);
  clearGoogleRedirectState();
  return session;
}

export async function signOutFirebaseAuth(): Promise<void> {
  try {
    const { signOut } = await getFirebaseAuthModule();
    await signOut(await getFirebaseAuthClient());
  } catch {
    // Backend cookie cleanup is still the source of truth for app access.
  } finally {
    clearGoogleRedirectState();
  }
}

export async function signUpWithEmailPassword(
  input: RegisterInput,
): Promise<FirebaseAuthResult> {
  const normalizedEmail = input.email.trim().toLowerCase();
  const data = await apiFetch<BackendAuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email: normalizedEmail,
      password: input.password,
      accountType: input.accountType,
      verificationToken: input.verificationToken,
      acceptedPrivacyPolicy: input.acceptedPrivacyPolicy,
      acceptedTerms: input.acceptedTerms,
      firstName: input.firstName?.trim() || undefined,
      lastName: input.lastName?.trim() || undefined,
      phone: input.phone?.trim() || undefined,
      companyName: input.companyName?.trim() || undefined,
      companyEmail: input.companyEmail?.trim().toLowerCase() || undefined,
      registrationNumber: input.registrationNumber?.trim() || undefined,
    }),
  });

  return mapAuthResponse(data, normalizedEmail, input.accountType);
}

export async function requestRegistrationCode(email: string, locale?: string): Promise<RegisterCodeResponse> {
  const normalizedEmail = email.trim().toLowerCase();
  return apiFetch<RegisterCodeResponse>("/auth/register-email-code/request", {
    method: "POST",
    body: JSON.stringify({
      email: normalizedEmail,
      locale,
    }),
  });
}

export async function verifyRegistrationCode(email: string, code: string): Promise<RegisterCodeVerifyResponse> {
  const normalizedEmail = email.trim().toLowerCase();
  return apiFetch<RegisterCodeVerifyResponse>("/auth/register-email-code/verify", {
    method: "POST",
    body: JSON.stringify({
      email: normalizedEmail,
      code: code.trim(),
    }),
  });
}

export async function establishUserSession(params: {
  userId: string;
  email: string;
  role?: PublicUserRole;
  accountType: PublicAccountType;
  companyId?: string;
  apartmentId?: string;
  rememberMe?: boolean;
}) {
  const resolvedRole = normalizeRole(params.role ?? params.accountType);
  const resolvedAccountType = normalizeAccountType(params.accountType ?? resolvedRole);

  persistSessionHints({
    role: resolvedRole,
    accountType: resolvedAccountType,
    email: params.email,
    userId: params.userId,
    companyId: params.companyId,
    apartmentId: params.apartmentId,
    rememberMe: params.rememberMe,
  });

  return {
    success: true,
    preview: false,
    role: resolvedRole,
    accountType: resolvedAccountType,
    companyId: params.companyId,
    apartmentId: params.apartmentId,
  };
}

export async function saveUserProfile(userId: string, payload: Record<string, unknown>) {
  const result = await apiFetch<{ success: boolean }>(`/users/${encodeURIComponent(userId)}/upsert`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const nextName = resolvePayloadName(payload);
  if (nextName) {
    persistBrowserName(nextName);
  }

  return result;
}

export async function changeAccountEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  return apiFetch<{ success: boolean; email?: string; pendingEmail?: string; verificationRequired?: boolean }>(
    "/auth/me/email",
    {
      method: "PATCH",
      body: JSON.stringify({
        email: normalizedEmail,
      }),
    },
  );
}

export async function confirmAccountEmailChange(token: string) {
  const result = await apiFetch<{ success: boolean; email?: string }>("/auth/me/email/confirm", {
    method: "POST",
    body: JSON.stringify({
      token,
    }),
  });

  if (result.email) {
    persistBrowserEmail(result.email);
  }

  return result;
}

export async function changeAccountPassword(currentPassword: string, newPassword: string) {
  return apiFetch<{ success: boolean }>("/auth/me/password", {
    method: "PATCH",
    body: JSON.stringify({
      currentPassword,
      newPassword,
    }),
  });
}

export async function confirmPasswordReset(oobCode: string, newPassword: string) {
  await apiFetch<{ success: boolean }>("/auth/confirm-password-reset", {
    method: "POST",
    body: JSON.stringify({
      oobCode,
      newPassword,
    }),
  });
}
