"use client";

import { DomeraApiError, apiFetch } from "@/shared/api/client";

export type PublicAccountType = "ManagementCompany" | "Resident" | "Landlord";

type FirebaseAuthResult = {
  idToken: string;
  userId: string;
  email: string;
  preview: boolean;
  accountType: PublicAccountType;
};

type UserProfileResponse = {
  id?: string;
  uid?: string;
  email?: string;
  role?: string;
  accountType?: string;
  companyId?: string;
  apartmentId?: string;
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

function normalizeAccountType(value?: string | null): PublicAccountType {
  const normalized = String(value ?? "")
    .trim()
    .replace(/[^a-z]/gi, "")
    .toLowerCase();

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
  if (accountType === "Resident") return "resident";
  if (accountType === "Landlord") return "landlord";
  return "managementCompany";
}

function persistSessionHints(params: {
  accountType: PublicAccountType;
  email: string;
  userId?: string;
  companyId?: string;
  apartmentId?: string;
  rememberMe?: boolean;
}) {
  if (typeof document === "undefined") return;

  const maxAge = params.rememberMe === false ? "" : `; max-age=${60 * 60 * 24 * 30}`;
  const cookieSuffix = `${maxAge}; path=/; SameSite=Lax`;
  const roleValue = toCookieValue(params.accountType);

  document.cookie = `domera_accountType=${roleValue}${cookieSuffix}`;
  document.cookie = `domera_role=${roleValue}${cookieSuffix}`;
  document.cookie = `userEmail=${encodeURIComponent(params.email)}${cookieSuffix}`;

  if (params.userId) {
    document.cookie = `userId=${encodeURIComponent(params.userId)}${cookieSuffix}`;
  }

  if (params.companyId) {
    document.cookie = `domera_companyId=${encodeURIComponent(params.companyId)}${cookieSuffix}`;
  }

  if (params.apartmentId) {
    document.cookie = `domera_apartmentId=${encodeURIComponent(params.apartmentId)}${cookieSuffix}`;
  }
}

function mapAuthResponse(data: BackendAuthResponse, fallbackEmail: string, fallbackAccountType: PublicAccountType): FirebaseAuthResult {
  if (!data.userId) {
    throw new Error("Authentication response is incomplete.");
  }

  return {
    idToken: "",
    userId: data.userId,
    email: data.email ?? fallbackEmail,
    preview: false,
    accountType: normalizeAccountType(data.accountType ?? data.role ?? fallbackAccountType),
  };
}

export async function signInWithEmailPassword(email: string, password: string): Promise<FirebaseAuthResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const data = await apiFetch<BackendAuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: normalizedEmail,
      password,
    }),
  });

  return mapAuthResponse(data, normalizedEmail, "ManagementCompany");
}

export async function signUpWithEmailPassword(
  email: string,
  password: string,
  accountType: PublicAccountType,
): Promise<FirebaseAuthResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const data = await apiFetch<BackendAuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email: normalizedEmail,
      password,
      accountType,
    }),
  });

  return mapAuthResponse(data, normalizedEmail, accountType);
}

export async function establishUserSession(params: {
  idToken: string;
  userId: string;
  email: string;
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
      }),
    });
  }

  const profile = await apiFetch<UserProfileResponse | null>(`/users/${encodeURIComponent(params.userId)}`).catch((error) => {
    if (error instanceof DomeraApiError) {
      return null;
    }

    throw error;
  });

  const resolvedAccountType = normalizeAccountType(profile?.accountType ?? profile?.role ?? params.accountType);

  persistSessionHints({
    accountType: resolvedAccountType,
    email: params.email,
    userId: params.userId,
    companyId: profile?.companyId,
    apartmentId: profile?.apartmentId,
    rememberMe: params.rememberMe,
  });

  return {
    success: true,
    preview: false,
    accountType: resolvedAccountType,
    companyId: profile?.companyId,
    apartmentId: profile?.apartmentId,
  };
}

export async function saveUserProfile(userId: string, payload: Record<string, unknown>) {
  return apiFetch<{ success: boolean }>(`/users/${encodeURIComponent(userId)}/upsert`, {
    method: "POST",
    body: JSON.stringify(payload),
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
