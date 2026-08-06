import { getRoleDataBundle, type RoleDataBundle } from "@/shared/lib/domera-api.server";

export async function getApartmentDetailsPageData(roleHint?: string): Promise<RoleDataBundle> {
  return getRoleDataBundle(roleHint);
}
