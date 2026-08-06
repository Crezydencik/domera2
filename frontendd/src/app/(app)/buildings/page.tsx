
import { getBuildingsPageData } from "@/shared/server/page-loaders/buildings.loader";
import { BuildingsManagement } from "./_buildings-management";

export default async function BuildingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ role?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const data = await getBuildingsPageData(params.role);

  return (
    <div className="space-y-6">
      <BuildingsManagement companyId={data.companyId} buildings={data.buildings} />
    </div>
  );
}
