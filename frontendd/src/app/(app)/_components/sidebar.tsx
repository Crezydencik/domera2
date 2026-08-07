import { getTranslations } from "next-intl/server";
import { RoleAwareSidebar } from "@/app/(app)/_components/role-aware-sidebar";
import { getCurrentProfile } from "@/shared/server/auth-context";
import { normalizeDashboardRole, type DashboardRole } from "@/shared/role-ui";

interface SidebarProps {
  children: React.ReactNode;
  initialProfile?: Record<string, unknown> | null;
  initialRole?: DashboardRole;
}

export async function Sidebar({ children, initialProfile, initialRole }: SidebarProps) {
  const t = await getTranslations("appShell");
  let profile = initialProfile ?? null;
  let roleHint: unknown = initialRole;

  if (!profile && !roleHint) {
    const fallbackProfile = await getCurrentProfile().catch(() => null);
    profile = fallbackProfile;
    roleHint =
      typeof profile?.role === "string" && profile.role.trim()
        ? profile.role
        : typeof profile?.accountType === "string" && profile.accountType.trim()
          ? profile.accountType
          : null;
  }

  const defaultRole = normalizeDashboardRole(
    typeof roleHint === "string"
      ? roleHint
      : typeof profile?.role === "string"
        ? profile.role
        : typeof profile?.accountType === "string"
          ? profile.accountType
          : undefined,
  );

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
