"use client";

import { DomeraApiError, apiFetch } from "@/shared/api/client";
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
  idToken: string;
  userId: string;
  email: string;
  preview: boolean;
  role: PublicUserRole;
  accountType: PublicAccountType;
};

type UserProfileResponse = {
  id?: string;
  uid?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  name?: string;
  displayName?: string;
  username?: string;
  userName?: string;
  role?: string;
  accountType?: string;
  companyId?: string;
  apartmentId?: string;
};

type BackendAuthResponse = {
  success?: boolean;
  userId?: string;
  email?: string;
  idToken?: string;
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
  idToken?: string;
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

  if (params.idToken) {
    document.cookie = `authToken=${encodeURIComponent(params.idToken)}${cookieSuffix}`;
  }

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

function resolveProfileName(profile?: UserProfileResponse | null): string | undefined {
  const firstName = profile?.firstName?.trim();
  const lastName = profile?.lastName?.trim();
  const joinedName = [firstName, lastName].filter(Boolean).join(" ").trim();

  return (
    joinedName ||
    profile?.fullName?.trim() ||
    profile?.name?.trim() ||
    profile?.displayName?.trim() ||
    undefined
  );
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
    idToken: data.idToken ?? "",
    userId: data.userId,
    email: data.email ?? fallbackEmail,
    preview: false,
    role: normalizeRole(data.role ?? data.accountType ?? fallbackAccountType),
    accountType: normalizeAccountType(data.accountType ?? data.role ?? fallbackAccountType),
  };
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
  idToken: string;
  userId: string;
  email: string;
  role?: PublicUserRole;
  accountType: PublicAccountType;
  rememberMe?: boolean;
}) {
  if (params.idToken?.trim()) {
    await apiFetch<{ success: boolean }>("/auth/session", {
      method: "POST",
      body: JSON.stringify({
        idToken: params.idToken,
        userId: params.userId,
        email: params.email,
        rememberMe: params.rememberMe,
      }),
    });
  }

  const profile = await apiFetch<UserProfileResponse | null>(`/users/${encodeURIComponent(params.userId)}`).catch((error) => {
    if (error instanceof DomeraApiError) {
      return null;
    }

    throw error;
  });

  const resolvedRole = normalizeRole(profile?.role ?? params.role ?? profile?.accountType ?? params.accountType);
  const resolvedAccountType = normalizeAccountType(profile?.accountType ?? resolvedRole ?? params.accountType);

  persistSessionHints({
    idToken: params.idToken,
    role: resolvedRole,
    accountType: resolvedAccountType,
    email: params.email,
    name: resolveProfileName(profile),
    userId: params.userId,
    companyId: profile?.companyId,
    apartmentId: profile?.apartmentId,
    rememberMe: params.rememberMe,
  });

  return {
    success: true,
    preview: false,
    role: resolvedRole,
    accountType: resolvedAccountType,
    companyId: profile?.companyId,
    apartmentId: profile?.apartmentId,
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
