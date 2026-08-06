import { getRoleDataBundle, type RoleDataBundle } from "@/shared/lib/domera-api.server";

export async function getDashboardPageData(roleHint?: string): Promise<RoleDataBundle> {
  return getRoleDataBundle(roleHint);
}
