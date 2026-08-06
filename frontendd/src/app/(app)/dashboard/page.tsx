import { RoleDashboard } from "./role-dashboard";
import { getDashboardPageData } from "@/shared/server/page-loaders/dashboard.loader";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ role?: string; buildingId?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const data = await getDashboardPageData(params.role);

  return <RoleDashboard data={data} selectedBuildingId={params.buildingId} />;
}
 
