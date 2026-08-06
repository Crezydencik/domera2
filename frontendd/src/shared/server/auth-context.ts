import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { DomeraApiError, apiFetch } from "@/shared/server/api-client";
import type { Building, DocumentItem, Invoice, MeterReading, NotificationItem, Resident } from "@/shared/lib/data";
import { type DashboardRole, normalizeDashboardRole } from "@/shared/role-ui";
import { ROUTES } from "@/shared/lib/routes";

type UnknownRecord = Record<string, unknown>;

export interface RoleDataBundle {
  role: DashboardRole;
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

export const getCurrentProfile = cache(async () => {
  return apiFetch<UnknownRecord>("/users/me");
});

export async function getAuthenticatedContext(roleHint?: string) {
  const store = await cookies();
  const sessionCookie = store.get("__session")?.value?.trim();

  if (!sessionCookie) {
    redirectToExpiredLogin();
  }

  try {
    const profile = await getCurrentProfile();
    const resolvedUserId = firstString(profile?.uid, profile?.id);
    const role = normalizeDashboardRole(
      firstString(
        profile?.role,
        profile?.accountType,
        roleHint,
      ),
    );

    return {
      userId: resolvedUserId,
      profile,
      role,
      companyId: firstString(profile?.companyId, resolvedUserId),
      apartmentId: firstString(profile?.apartmentId),
    };
  } catch (error) {
    if (error instanceof DomeraApiError && [401, 403].includes(error.status)) {
      redirectToExpiredLogin();
    }

    if (error instanceof DomeraApiError && error.status === 404) {
      const role = normalizeDashboardRole(roleHint);
      return {
        userId: undefined,
        profile: {} as UnknownRecord,
        role,
        companyId: undefined,
        apartmentId: undefined,
      };
    }

    throw error;
  }
}

export type AuthenticatedContext = Awaited<ReturnType<typeof getAuthenticatedContext>>;
