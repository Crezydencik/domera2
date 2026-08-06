import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { RoleAwareSidebar } from "@/app/(app)/_components/role-aware-sidebar";
import { getCurrentProfile } from "@/shared/lib/domera-api.server";
import { normalizeDashboardRole } from "@/shared/role-ui";

interface SidebarProps {
  children: React.ReactNode;
}

function firstHeader(headerStore: Headers, name: string) {
  const value = headerStore.get(name)?.trim();
  return value || undefined;
}

function buildHeaderProfile(headerStore: Headers): Record<string, unknown> | null {
  const uid = firstHeader(headerStore, "x-domera-user-id");
  const role = firstHeader(headerStore, "x-domera-role");
  const email = firstHeader(headerStore, "x-domera-email");
  const companyId = firstHeader(headerStore, "x-domera-company-id");
  const apartmentId = firstHeader(headerStore, "x-domera-apartment-id");

  if (!uid && !role && !email && !companyId && !apartmentId) {
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

export async function Sidebar({ children }: SidebarProps) {
  const t = await getTranslations("appShell");
  const headerStore = await headers();
  let profile = buildHeaderProfile(headerStore);
  let roleHint = headerStore.get("x-domera-role");

  if (!roleHint) {
    const fallbackProfile = await getCurrentProfile().catch(() => null);
    profile = fallbackProfile;
    roleHint =
      typeof profile?.role === "string" && profile.role.trim()
        ? profile.role
        : typeof profile?.accountType === "string" && profile.accountType.trim()
          ? profile.accountType
          : null;
  }

  const defaultRole = normalizeDashboardRole(roleHint);

  return (
    <RoleAwareSidebar
      brand={t("brand")}
      title={t("title")}
      description={t("description")}
      defaultRole={defaultRole}
      initialProfile={profile}
    >
      {children}
    </RoleAwareSidebar>
  );
}
