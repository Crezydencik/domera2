"use client";

import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  type Auth,
  type User,
} from "firebase/auth";
import { apiFetch } from "@/shared/api/client";
import { getFirebaseAuth } from "@/shared/lib/firebase-client";
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

function toCookieValue(accountType: PublicAccountType): string {
  return accountType;
}

export function accountTypeToDashboardRole(accountType: PublicAccountType): string {
  if (accountType === "PlatformAdmin") return "platformAdmin";
  if (accountType === "Resident") return "resident";
  if (accountType === "Landlord") return "landlord";
  return "managementCompany";
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
  if (typeof document === "undefined") return;

  const maxAge = params.rememberMe === false ? "" : `; max-age=${60 * 60 * 24 * 30}`;
  const cookieSuffix = `${maxAge}; path=/; SameSite=Lax`;
  const roleValue = params.role;
  const accountTypeValue = toCookieValue(params.accountType);

  document.cookie = `domera_session=1${cookieSuffix}`;
  document.cookie = `domera_accountType=${accountTypeValue}${cookieSuffix}`;
  document.cookie = `domera_role=${roleValue}${cookieSuffix}`;
  document.cookie = `userEmail=${encodeURIComponent(params.email)}${cookieSuffix}`;

  if (params.name) {
    document.cookie = `userName=${encodeURIComponent(params.name)}${cookieSuffix}`;
  } else {
    document.cookie = "userName=; Max-Age=0; path=/; SameSite=Lax";
  }

  if (params.userId) {
    document.cookie = `userId=${encodeURIComponent(params.userId)}${cookieSuffix}`;
  }

  if (params.companyId) {
    document.cookie = `domera_companyId=${encodeURIComponent(params.companyId)}${cookieSuffix}`;
  }

  if (params.apartmentId) {
    document.cookie = `domera_apartmentId=${encodeURIComponent(params.apartmentId)}${cookieSuffix}`;
  }

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
  if (typeof document === "undefined") return;

  document.cookie = `userName=${encodeURIComponent(name)}; max-age=${60 * 60 * 24 * 30}; path=/; SameSite=Lax`;
  notifyAuthSessionChanged();
}

function persistBrowserEmail(email: string) {
  if (typeof document === "undefined") return;

  document.cookie = `userEmail=${encodeURIComponent(email)}; max-age=${60 * 60 * 24 * 30}; path=/; SameSite=Lax`;
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

function createGoogleProvider() {
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
    let unsubscribe: () => void = () => undefined;
    const timeout = window.setTimeout(() => {
      unsubscribe();
      resolve(auth.currentUser);
    }, GOOGLE_REDIRECT_FALLBACK_TIMEOUT_MS);

    unsubscribe = onAuthStateChanged(auth, (user) => {
      window.clearTimeout(timeout);
      unsubscribe();
      resolve(user);
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
  await signInWithRedirect(await getFirebaseAuth(), createGoogleProvider());
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
    const credential = await signInWithPopup(await getFirebaseAuth(), createGoogleProvider());
    return createGoogleBackendSession(credential.user, rememberMe);
  } catch (error) {
    if (isPopupBlockedError(error)) {
      return startGoogleRedirectSignIn(rememberMe);
    }

    throw error;
  }
}

export async function completeGoogleRedirectSignIn(): Promise<FirebaseAuthResult | null> {
  const auth = await getFirebaseAuth();
  const hadPendingRedirect = hasPendingGoogleRedirect();
  const credential = await getRedirectResult(auth);
  const rememberMe = readGoogleRedirectRememberMe();
  const user = credential?.user ?? auth.currentUser ?? await waitForRedirectUser(auth);

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

  const currentUserId = typeof document === "undefined"
    ? ""
    : decodeURIComponent(document.cookie.match(/(?:^|; )userId=([^;]*)/)?.[1] ?? "");
  const nextName = resolvePayloadName(payload);
  if (nextName && currentUserId === userId) {
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
