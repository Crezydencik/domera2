import { RoleDashboard } from "./role-dashboard";
import { getRoleDataBundle } from "@/shared/lib/domera-api.server";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ role?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const data = await getRoleDataBundle(params.role);

  return <RoleDashboard data={data} />;
}
 