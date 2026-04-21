import { cookies, headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { RoleAwareSidebar } from "@/app/(app)/_components/role-aware-sidebar";
import { normalizeDashboardRole } from "@/shared/role-ui";

interface SidebarProps {
  children: React.ReactNode;
}

export async function Sidebar({ children }: SidebarProps) {
  const t = await getTranslations("appShell");
  const cookieStore = await cookies();
  const headerStore = await headers();
  const defaultRole = normalizeDashboardRole(
    headerStore.get("x-domera-role") ??
      cookieStore.get("domera_accountType")?.value ??
      cookieStore.get("domera_role")?.value,
  );

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
