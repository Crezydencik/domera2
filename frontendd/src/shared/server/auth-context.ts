import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { DomeraApiError, apiFetch } from "@/shared/server/api-client";
import type { Building, DocumentItem, Invoice, MeterReading, NotificationItem, Resident } from "@/shared/lib/data";
import { type DashboardRole, normalizeDashboardRole } from "@/shared/role-ui";
import { ROUTES } from "@/shared/lib/routes";

type UnknownRecord = Record<string, unknown>;

export interface RoleDataBundle {
  role: DashboardRole;
  rawRole?: string;
  userId?: string;
  profile?: UnknownRecord;
  companyId?: string;
  apartmentId?: string;
  buildings: Building[];
  apartments: UnknownRecord[];
  residents: Resident[];
  invoices: Invoice[];
  meterReadings: MeterReading[];
  documents: DocumentItem[];
  notifications: NotificationItem[];
  managementCompanies: UnknownRecord[];
}

function redirectToExpiredLogin(): never {
  redirect(`${ROUTES.login}?expired=1`);
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "вЂ”";
}

function firstOptionalString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function buildHeaderProfile(headerStore: Headers, roleHint?: string): UnknownRecord | null {
  const uid = firstOptionalString(headerStore.get("x-domera-user-id"));
  const role = firstOptionalString(headerStore.get("x-domera-role"), roleHint);
  const email = firstOptionalString(headerStore.get("x-domera-email"));
  const companyId = firstOptionalString(headerStore.get("x-domera-company-id"));
  const apartmentId = firstOptionalString(headerStore.get("x-domera-apartment-id"));

  if (!uid || !role) {
    return null;
  }

  return {
    id: uid,
    uid,
    role,
    accountType: role,
    email,
    companyId,
    apartmentId,
  };
}

function isRawAccountantRole(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/[^a-z]/gi, "")
    .toLowerCase() === "accountant";
}

function contextFromProfile(profile: UnknownRecord, roleHint?: string) {
  const resolvedUserId = firstString(profile?.uid, profile?.id);
  const rawRole = firstOptionalString(profile?.role, profile?.accountType, roleHint);
  const role = normalizeDashboardRole(
    firstString(
      rawRole,
      roleHint,
    ),
  );
  const profileCompanyId = firstOptionalString(profile?.companyId);
  const shouldUseOwnUserAsCompany = role === "managementCompany" && !isRawAccountantRole(rawRole);

  return {
    userId: resolvedUserId,
    profile,
    role,
    rawRole,
    companyId: profileCompanyId ?? (shouldUseOwnUserAsCompany ? resolvedUserId : undefined),
    apartmentId: firstString(profile?.apartmentId),
  };
}

export const getCurrentProfile = cache(async () => {
  return apiFetch<UnknownRecord>("/users/me");
});

export async function getAuthenticatedContext(roleHint?: string, options?: { requireFreshProfile?: boolean }) {
  const store = await cookies();
  const sessionCookie = store.get("__session")?.value?.trim();
  const headerProfile = buildHeaderProfile(await headers(), roleHint);

  if (!sessionCookie && !headerProfile) {
    redirectToExpiredLogin();
  }

  if (!options?.requireFreshProfile) {
    if (headerProfile) {
      const needsFreshAccountantCompany =
        isRawAccountantRole(headerProfile.role) && !firstOptionalString(headerProfile.companyId);
      if (!needsFreshAccountantCompany) {
        return contextFromProfile(headerProfile, roleHint);
      }
    }
  }

  try {
    const profile = await getCurrentProfile();
    return contextFromProfile(profile, roleHint);
  } catch (error) {
    if (error instanceof DomeraApiError && [401, 403].includes(error.status)) {
      if (headerProfile) {
        return contextFromProfile(headerProfile, roleHint);
      }

      redirectToExpiredLogin();
    }

    if (error instanceof DomeraApiError && error.status === 404) {
      const role = normalizeDashboardRole(roleHint);
      return {
        userId: undefined,
        profile: {} as UnknownRecord,
        role,
        rawRole: roleHint,
        companyId: undefined,
        apartmentId: undefined,
      };
    }

    throw error;
  }
}

export type AuthenticatedContext = Awaited<ReturnType<typeof getAuthenticatedContext>>;
