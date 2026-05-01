import { getRoleDataBundle } from "@/shared/lib/domera-api.server";
import { ApartmentsManagementView } from "./_management-view";
import { ApartmentsResidentView } from "./_resident-view";

export default async function ApartmentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ role?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const data = await getRoleDataBundle(params.role);

  if (data.role === "managementCompany") {
    return <ApartmentsManagementView data={data} />;
  }

  return <ApartmentsResidentView data={data} />;
}
