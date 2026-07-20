import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { RoleAwareSidebar } from "@/app/(app)/_components/role-aware-sidebar";
import { apiFetch } from "@/shared/lib/domera-api.server";
import { normalizeDashboardRole } from "@/shared/role-ui";

interface SidebarProps {
  children: React.ReactNode;
}

export async function Sidebar({ children }: SidebarProps) {
  const t = await getTranslations("appShell");
  const headerStore = await headers();
  let roleHint = headerStore.get("x-domera-role");

  if (!roleHint) {
    const profile = await apiFetch<Record<string, unknown> | null>("/users/me").catch(() => null);
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
    >
      {children}
    </RoleAwareSidebar>
  );
}
